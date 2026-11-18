//! Video and audio jobs on this computer's own hardware, with FFmpeg.
//!
//! Safety rule: the page never sends FFmpeg commands or file paths. It sends a
//! small job description (which format, how long, how big), every field is
//! checked, and the engine builds the FFmpeg command itself. Files are known
//! only by random ids the engine handed out, and everything lives in one
//! private temporary folder that is deleted when Rarvon closes.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

use serde::Deserialize;
use serde_json::{json, Value};

pub struct Native {
    ffmpeg: PathBuf,
    dir: PathBuf,
    files: Mutex<HashMap<String, PathBuf>>,
    jobs: Mutex<HashMap<String, Arc<Mutex<Job>>>>,
    encoders: Mutex<HashMap<String, Option<&'static str>>>,
}

#[derive(Clone, Copy, PartialEq)]
enum State {
    Running,
    Done,
    Failed,
    Cancelled,
}

struct Job {
    child: Option<Child>,
    state: State,
    progress: f64,
    error: String,
    output: PathBuf,
    mime: &'static str,
    extension: &'static str,
    copied: bool,
}

/// What the page may ask for. Unknown fields are refused.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct JobSpec {
    file: String,
    kind: String, // "video" | "gif" | "audio"
    container: Option<String>,
    codec: Option<String>,
    trim_start: Option<f64>,
    trim_end: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    quality: Option<String>,
    video_bitrate: Option<u64>,
    audio_bitrate: Option<u64>,
    target: Option<String>,
    start: Option<f64>,
    seconds: Option<f64>,
    fps: Option<f64>,
}

/// What FFmpeg says about a file.
#[derive(Default)]
pub struct Probe {
    format: String,
    duration: f64,
    bitrate: f64,
    video: Option<(String, u32, u32)>,
    audio: Option<(String, u32, u32)>,
}

impl Native {
    /// FFmpeg next to the program (`ffmpeg/ffmpeg.exe`), or while developing, in this crate.
    pub fn find() -> Option<Native> {
        let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
        let mut places = Vec::new();
        if let Some(dir) = std::env::current_exe().ok().and_then(|e| e.parent().map(Path::to_path_buf)) {
            places.push(dir.join("ffmpeg").join(exe));
            places.push(dir.join(exe));
        }
        places.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ffmpeg").join(exe));
        let ffmpeg = places.into_iter().find(|p| p.is_file())?;

        let temp = std::env::temp_dir();
        clean_old_folders(&temp);
        let dir = temp.join(format!("bench-engine-{}", crate::secret_key()[..16].to_string()));
        fs::create_dir_all(&dir).ok()?;
        Some(Native {
            ffmpeg,
            dir,
            files: Mutex::default(),
            jobs: Mutex::default(),
            encoders: Mutex::default(),
        })
    }

    /// Stops running jobs and deletes every file Rarvon made.
    pub fn shut_down(&self) {
        for job in self.jobs.lock().unwrap().values() {
            if let Some(child) = job.lock().unwrap().child.as_mut() {
                let _ = child.kill();
            }
        }
        thread::sleep(Duration::from_millis(300));
        let _ = fs::remove_dir_all(&self.dir);
    }

    fn command(&self) -> Command {
        let mut cmd = Command::new(&self.ffmpeg);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // no console window
        }
        cmd.arg("-hide_banner").stdin(Stdio::null());
        cmd
    }

    /// Saves a file the person chose into Rarvon's private folder.
    pub fn upload(&self, body: &mut dyn Read, ext: &str) -> Result<Value, String> {
        let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect::<String>().to_ascii_lowercase();
        let id = crate::secret_key()[..24].to_string();
        let path = self.dir.join(if ext.is_empty() { id.clone() } else { format!("{id}.{ext}") });
        let mut out = fs::File::create(&path).map_err(|e| e.to_string())?;
        std::io::copy(body, &mut out).map_err(|e| e.to_string())?;
        self.files.lock().unwrap().insert(id.clone(), path);
        Ok(json!({ "id": id }))
    }

    fn file(&self, id: &str) -> Result<PathBuf, String> {
        self.files.lock().unwrap().get(id).cloned().ok_or_else(|| "unknown file".to_string())
    }

    pub fn probe_json(&self, id: &str) -> Result<Value, String> {
        let p = self.probe(&self.file(id)?)?;
        Ok(json!({
            "format": p.format, "duration": p.duration, "bitrate": p.bitrate,
            "video": p.video.map(|(codec, w, h)| json!({ "codec": codec, "width": w, "height": h })),
            "audio": p.audio.map(|(codec, rate, ch)| json!({ "codec": codec, "sampleRate": rate, "channels": ch })),
        }))
    }

    fn probe(&self, path: &Path) -> Result<Probe, String> {
        let out = self.command().arg("-i").arg(path).output().map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stderr);
        let mut p = parse_probe(&text);
        if p.format.is_empty() {
            return Err("unreadable".into());
        }
        if p.bitrate == 0.0 && p.duration > 0.0 {
            p.bitrate = fs::metadata(path).map(|m| m.len() as f64 * 8.0 / p.duration).unwrap_or(0.0);
        }
        Ok(p)
    }

    /// A still picture from early in the video (JPEG, 480 px wide), for the tool's preview.
    pub fn thumbnail(&self, id: &str) -> Result<Vec<u8>, String> {
        let input = self.file(id)?;
        let probe = self.probe(&input)?;
        if probe.video.is_none() {
            return Err("no video".into());
        }
        let at = (probe.duration * 0.1).min(1.0);
        let out = self
            .command()
            .args(["-loglevel", "error", "-ss", &format!("{at:.3}"), "-i"])
            .arg(&input)
            .args(["-frames:v", "1", "-vf", "scale=480:-2", "-c:v", "mjpeg", "-q:v", "4", "-f", "image2pipe", "pipe:1"])
            .output()
            .map_err(|e| e.to_string())?;
        if out.stdout.is_empty() {
            return Err("no picture".into());
        }
        Ok(out.stdout)
    }

    /// The FFmpeg encoder that works on this computer for a codec, trying the
    /// graphics card first, then the processor. Tested once, never assumed.
    fn encoder(&self, codec: &str) -> Option<&'static str> {
        if let Some(found) = self.encoders.lock().unwrap().get(codec) {
            return *found;
        }
        let candidates: &[&'static str] = match codec {
            "avc" => &["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libopenh264"],
            "hevc" => &["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_mf", "libkvazaar"],
            "vp9" => &["libvpx-vp9"],
            "vp8" => &["libvpx"],
            "av1" => &["av1_nvenc", "av1_qsv", "av1_amf", "libsvtav1"],
            _ => &[],
        };
        let found = candidates.iter().copied().find(|enc| {
            self.command()
                .args(["-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=256x256:r=30:d=0.3"])
                .args(["-frames:v", "5", "-c:v", enc, "-f", "null", "-"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|s| s.success())
        });
        self.encoders.lock().unwrap().insert(codec.to_string(), found);
        found
    }

    pub fn can_encode(&self, codec: &str) -> Value {
        let encoder = self.encoder(codec);
        json!({ "ok": encoder.is_some(), "encoder": encoder })
    }

    /// Starts a job and returns its id at once; the page asks for progress.
    pub fn start(self: &Arc<Self>, spec: JobSpec) -> Result<Value, String> {
        let input = self.file(&spec.file)?;
        let probe = self.probe(&input)?;
        let plan = match spec.kind.as_str() {
            "video" => self.plan_video(&spec, &probe)?,
            "gif" => plan_gif(&spec, &probe)?,
            "audio" => plan_audio(&spec, &probe)?,
            _ => return Err("unknown job".into()),
        };

        let id = crate::secret_key()[..24].to_string();
        let output = self.dir.join(format!("{id}-out.{}", plan.extension));
        let mut cmd = self.command();
        cmd.args(["-loglevel", "error", "-nostats", "-progress", "pipe:1", "-y"]);
        cmd.args(&plan.before_input).arg("-i").arg(&input).args(&plan.after_input).arg(&output);
        let mut child = cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        let job = Arc::new(Mutex::new(Job {
            child: Some(child),
            state: State::Running,
            progress: 0.0,
            error: String::new(),
            output,
            mime: plan.mime,
            extension: plan.extension,
            copied: plan.copied,
        }));
        self.jobs.lock().unwrap().insert(id.clone(), Arc::clone(&job));

        // Progress: FFmpeg reports how far into the file it is.
        let length = plan.length.max(0.001);
        let progress_job = Arc::clone(&job);
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(us) = line.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok()) {
                    progress_job.lock().unwrap().progress = (us / 1e6 / length).clamp(0.0, 0.99);
                }
            }
        });
        // The end: success, failure (with FFmpeg's last words), or cancelled.
        let end_job = Arc::clone(&job);
        thread::spawn(move || {
            let mut err = String::new();
            let _ = BufReader::new(stderr).take(64 * 1024).read_to_string(&mut err);
            loop {
                let mut j = end_job.lock().unwrap();
                if j.state == State::Cancelled {
                    break;
                }
                let status = j.child.as_mut().map(|c| c.try_wait());
                match status {
                    Some(Ok(Some(s))) => {
                        j.child = None;
                        if s.success() && j.output.is_file() {
                            j.state = State::Done;
                            j.progress = 1.0;
                        } else {
                            j.state = State::Failed;
                            j.error = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("FFmpeg stopped").to_string();
                        }
                        break;
                    }
                    Some(Ok(None)) => {}
                    _ => {
                        j.state = State::Failed;
                        j.error = "FFmpeg stopped".into();
                        break;
                    }
                }
                drop(j);
                thread::sleep(Duration::from_millis(100));
            }
        });
        Ok(json!({ "id": id }))
    }

    fn job(&self, id: &str) -> Result<Arc<Mutex<Job>>, String> {
        self.jobs.lock().unwrap().get(id).cloned().ok_or_else(|| "unknown job".to_string())
    }

    pub fn status(&self, id: &str) -> Result<Value, String> {
        let job = self.job(id)?;
        let j = job.lock().unwrap();
        let state = match j.state {
            State::Running => "running",
            State::Done => "done",
            State::Failed => "failed",
            State::Cancelled => "cancelled",
        };
        Ok(json!({ "state": state, "progress": j.progress, "error": j.error, "mime": j.mime, "extension": j.extension, "copied": j.copied }))
    }

    pub fn cancel(&self, id: &str) -> Result<Value, String> {
        let job = self.job(id)?;
        let mut j = job.lock().unwrap();
        if j.state == State::Running {
            j.state = State::Cancelled;
            if let Some(mut child) = j.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            let _ = fs::remove_file(&j.output);
        }
        Ok(json!({}))
    }

    /// The finished file, handed over once; the job is forgotten afterwards.
    pub fn take_result(&self, id: &str) -> Result<(PathBuf, &'static str), String> {
        let job = self.job(id)?;
        let j = job.lock().unwrap();
        if j.state != State::Done {
            return Err("not finished".into());
        }
        Ok((j.output.clone(), j.mime))
    }

    pub fn forget_job(&self, id: &str) {
        if let Some(job) = self.jobs.lock().unwrap().remove(id) {
            let _ = fs::remove_file(&job.lock().unwrap().output);
        }
    }

    fn plan_video(&self, s: &JobSpec, p: &Probe) -> Result<Plan, String> {
        let container = one_of(s.container.as_deref().unwrap_or("mp4"), &["mp4", "webm", "mov", "mkv"])?;
        let (src_codec, src_w, src_h) = p.video.clone().ok_or("This file doesn't have a video track.")?;
        let src_codec = video_codec_name(&src_codec);
        let (before, mut after, length) = trim_args(s.trim_start, s.trim_end, p.duration)?;

        let fits = |codec: &str| match container {
            "webm" => matches!(codec, "vp8" | "vp9" | "av1"),
            "mp4" | "mov" => matches!(codec, "avc" | "hevc" | "vp9" | "av1"),
            _ => matches!(codec, "avc" | "hevc" | "vp8" | "vp9" | "av1"),
        };
        let reencode = s.codec.is_some() || s.width.is_some() || s.quality.is_some() || s.video_bitrate.is_some() || !fits(&src_codec);

        after.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0?".into(), "-map_metadata".into(), "0".into()]);
        if reencode {
            let codec = match s.codec.as_deref() {
                Some(c) => one_of(c, &["avc", "hevc", "vp8", "vp9", "av1"])?.to_string(),
                None if fits(&src_codec) && self.encoder(&src_codec).is_some() => src_codec.clone(),
                None if container == "webm" => "vp9".into(),
                None => "avc".into(),
            };
            let encoder = self.encoder(&codec).ok_or("This computer has no encoder for that format.")?;
            let (out_w, out_h) = match (s.width, s.height) {
                (Some(w), Some(h)) => (even(w.clamp(16, 8192)), even(h.clamp(16, 8192))),
                _ => (even(src_w), even(src_h)),
            };
            if s.width.is_some() {
                after.extend(["-vf".into(), format!("scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2")]);
            }
            let pixels = (out_w as f64) * (out_h as f64);
            let bitrate = s.video_bitrate.map(|b| b as f64).unwrap_or_else(|| match s.quality.as_deref() {
                Some("high") => pixels * 30.0 * 0.10,
                Some("low") => pixels * 30.0 * 0.035,
                Some(_) => pixels * 30.0 * 0.06,
                // Same look as the original: keep its bitrate (scaled to the new size).
                None => p.bitrate * pixels / ((src_w.max(1) * src_h.max(1)) as f64),
            });
            let bitrate = bitrate.clamp(150_000.0, 80_000_000.0) as u64;
            after.extend(["-c:v".into(), encoder.into(), "-b:v".into(), bitrate.to_string()]);
            match encoder {
                "libvpx-vp9" | "libvpx" => after.extend(["-deadline".into(), "good".into(), "-cpu-used".into(), "4".into(), "-row-mt".into(), "1".into()]),
                "libsvtav1" => after.extend(["-preset".into(), "8".into()]),
                _ => {}
            }
        } else {
            after.extend(["-c:v".into(), "copy".into()]);
        }

        // Sound: copied when it fits the container and nothing asks to change it.
        let audio_fits = |codec: &str| match container {
            "webm" => matches!(codec, "opus" | "vorbis"),
            "mp4" | "mov" => matches!(codec, "aac" | "mp3" | "alac" | "ac3" | "eac3" | "opus" | "flac"),
            _ => true,
        };
        if let Some((a_codec, _, _)) = &p.audio {
            let mp4_wants_aac = s.codec.is_some() && container != "webm" && container != "mkv" && a_codec != "aac";
            if audio_fits(a_codec) && s.audio_bitrate.is_none() && s.quality.is_none() && !mp4_wants_aac {
                after.extend(["-c:a".into(), "copy".into()]);
            } else {
                let bitrate = s.audio_bitrate.unwrap_or(match s.quality.as_deref() {
                    Some("high") => 160_000,
                    Some("low") => 96_000,
                    _ => 128_000,
                });
                let enc = if container == "webm" { "libopus" } else { "aac" };
                after.extend(["-c:a".into(), enc.into(), "-b:a".into(), bitrate.clamp(32_000, 512_000).to_string()]);
            }
        }
        let (format, mime) = match container {
            "mp4" => ("mp4", "video/mp4"),
            "mov" => ("mov", "video/quicktime"),
            "mkv" => ("matroska", "video/x-matroska"),
            _ => ("webm", "video/webm"),
        };
        if matches!(container, "mp4" | "mov") {
            after.extend(["-movflags".into(), "+faststart".into()]);
        }
        after.extend(["-f".into(), format.into()]);
        Ok(Plan { before_input: before, after_input: after, length, mime, extension: ext_of(container), copied: !reencode })
    }
}

struct Plan {
    before_input: Vec<String>,
    after_input: Vec<String>,
    /// Seconds of output, for progress.
    length: f64,
    mime: &'static str,
    extension: &'static str,
    copied: bool,
}

fn ext_of(container: &str) -> &'static str {
    match container {
        "mp4" => "mp4",
        "mov" => "mov",
        "mkv" => "mkv",
        _ => "webm",
    }
}

fn one_of<'a>(value: &'a str, allowed: &[&str]) -> Result<&'a str, String> {
    if allowed.contains(&value) { Ok(value) } else { Err(format!("not allowed: {value}")) }
}

fn even(n: u32) -> u32 {
    (n / 2 * 2).max(2)
}

fn finite(n: f64) -> Result<f64, String> {
    if n.is_finite() && n >= 0.0 { Ok(n) } else { Err("bad number".into()) }
}

fn trim_args(start: Option<f64>, end: Option<f64>, duration: f64) -> Result<(Vec<String>, Vec<String>, f64), String> {
    let start = finite(start.unwrap_or(0.0))?;
    let end = match end {
        Some(e) => finite(e)?.min(if duration > 0.0 { duration } else { f64::MAX }),
        None => duration,
    };
    let mut before = Vec::new();
    let mut after = Vec::new();
    if start > 0.0 {
        before.extend(["-ss".to_string(), format!("{start:.3}")]);
    }
    if end > start && (end < duration || duration <= 0.0) {
        after.extend(["-t".to_string(), format!("{:.3}", end - start)]);
    }
    Ok((before, after, (end - start).max(0.0)))
}

fn plan_gif(s: &JobSpec, p: &Probe) -> Result<Plan, String> {
    let (_, src_w, _) = p.video.clone().ok_or("This file doesn't have a video track.")?;
    let start = finite(s.start.unwrap_or(0.0))?;
    let seconds = finite(s.seconds.unwrap_or(5.0))?.clamp(0.1, 120.0);
    let fps = finite(s.fps.unwrap_or(10.0))?.clamp(1.0, 50.0);
    let width = even(s.width.unwrap_or(480).clamp(16, 1920).min(src_w.max(16)));
    let filter = format!(
        "fps={fps},scale={width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4"
    );
    Ok(Plan {
        before_input: vec!["-ss".into(), format!("{start:.3}")],
        after_input: vec!["-t".into(), format!("{seconds:.3}"), "-an".into(), "-filter_complex".into(), filter, "-loop".into(), "0".into(), "-f".into(), "gif".into()],
        length: seconds,
        mime: "image/gif",
        extension: "gif",
        copied: false,
    })
}

fn plan_audio(s: &JobSpec, p: &Probe) -> Result<Plan, String> {
    let (a_codec, _, _) = p.audio.clone().ok_or("This file has no audio track.")?;
    let (before, mut after, length) = trim_args(s.trim_start, s.trim_end, p.duration)?;
    after.extend(["-vn".into(), "-map".into(), "0:a:0".into()]);
    let bitrate = s.audio_bitrate.unwrap_or(160_000).clamp(16_000, 512_000).to_string();

    let mut target = one_of(s.target.as_deref().unwrap_or("original"), &["original", "opus", "aac", "mp3", "wav"])?;
    if target == "original" {
        let copy = match a_codec.as_str() {
            "aac" => Some(("mp4", "audio/mp4", "m4a")),
            "opus" | "vorbis" => Some(("ogg", "audio/ogg", "ogg")),
            "mp3" => Some(("mp3", "audio/mpeg", "mp3")),
            _ => None,
        };
        if let Some((format, mime, extension)) = copy {
            after.extend(["-c:a".into(), "copy".into(), "-f".into(), format.into()]);
            return Ok(Plan { before_input: before, after_input: after, length, mime, extension, copied: true });
        }
        target = "opus";
    }
    let (enc, format, mime, extension) = match target {
        "opus" => ("libopus", "ogg", "audio/ogg", "ogg"),
        "aac" => ("aac", "mp4", "audio/mp4", "m4a"),
        "mp3" => ("libmp3lame", "mp3", "audio/mpeg", "mp3"),
        _ => ("pcm_s16le", "wav", "audio/wav", "wav"),
    };
    after.extend(["-c:a".into(), enc.into()]);
    if target != "wav" {
        after.extend(["-b:a".into(), bitrate]);
    }
    after.extend(["-f".into(), format.into()]);
    Ok(Plan { before_input: before, after_input: after, length, mime, extension, copied: false })
}

/// FFmpeg's codec names → the names Rarvon's tools use.
fn video_codec_name(ffmpeg: &str) -> String {
    match ffmpeg {
        "h264" => "avc".into(),
        other => other.into(),
    }
}

/// Reads `ffmpeg -i file` output: container, length, bitrate, first video and audio stream.
fn parse_probe(text: &str) -> Probe {
    let mut p = Probe::default();
    let mut rotated = false;
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("Input #0, ") {
            p.format = rest.split(", from").next().unwrap_or("").to_string();
        } else if let Some(rest) = t.strip_prefix("Duration: ") {
            let d = rest.split(',').next().unwrap_or("");
            let parts: Vec<f64> = d.split(':').filter_map(|x| x.trim().parse().ok()).collect();
            if parts.len() == 3 {
                p.duration = parts[0] * 3600.0 + parts[1] * 60.0 + parts[2];
            }
            if let Some(b) = rest.split("bitrate: ").nth(1).and_then(|b| b.split_whitespace().next()).and_then(|b| b.parse::<f64>().ok()) {
                p.bitrate = b * 1000.0;
            }
        } else if t.starts_with("Stream #0:") && t.contains("Video: ") && p.video.is_none() {
            let rest = t.split("Video: ").nth(1).unwrap_or("");
            let codec = rest.split([' ', ',']).next().unwrap_or("").to_string();
            let size = rest
                .split([' ', ','])
                .filter_map(|tok| {
                    let (w, h) = tok.split_once('x')?;
                    if w.starts_with('0') { return None; }
                    Some((w.parse::<u32>().ok()?, h.parse::<u32>().ok()?))
                })
                .find(|(w, h)| *w >= 2 && *h >= 2);
            if let Some((w, h)) = size {
                p.video = Some((codec, w, h));
            }
        } else if t.starts_with("Stream #0:") && t.contains("Audio: ") && p.audio.is_none() {
            let rest = t.split("Audio: ").nth(1).unwrap_or("");
            let codec = rest.split([' ', ',']).next().unwrap_or("").to_string();
            let fields: Vec<&str> = rest.split(',').map(str::trim).collect();
            let rate = fields.iter().find_map(|f| f.strip_suffix(" Hz").and_then(|n| n.parse().ok())).unwrap_or(0);
            let channels = fields.get(2).map(|f| channel_count(f)).unwrap_or(2);
            p.audio = Some((codec, rate, channels));
        } else if t.contains("rotation of") && (t.contains("-90") || t.contains(" 90") || t.contains("270")) {
            rotated = true;
        }
    }
    if rotated {
        if let Some((_, w, h)) = p.video.as_mut() {
            std::mem::swap(w, h);
        }
    }
    p
}

fn channel_count(layout: &str) -> u32 {
    let l = layout.split('(').next().unwrap_or("").trim();
    match l {
        "mono" => 1,
        "stereo" => 2,
        "2.1" | "3.0" => 3,
        "quad" | "4.0" => 4,
        "5.0" => 5,
        "5.1" => 6,
        "6.1" => 7,
        "7.1" => 8,
        _ => l.split_whitespace().next().and_then(|n| n.parse().ok()).unwrap_or(2),
    }
}

/// Removes leftovers from a Rarvon that didn't close normally (older than a day).
fn clean_old_folders(temp: &Path) {
    let Ok(entries) = fs::read_dir(temp) else { return };
    let day = Duration::from_secs(24 * 3600);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let old = entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok()).is_some_and(|age| age > day);
        if name.to_string_lossy().starts_with("bench-engine-") && old {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_ffmpeg_file_details() {
        let text = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':\n  Duration: 00:01:02.50, start: 0.000000, bitrate: 2500 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 2300 kb/s, 30 fps\n    Side data:\n      displaymatrix: rotation of -90.00 degrees\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s\n";
        let p = parse_probe(text);
        assert_eq!(p.format, "mov,mp4,m4a,3gp,3g2,mj2");
        assert!((p.duration - 62.5).abs() < 1e-9);
        assert_eq!(p.bitrate, 2_500_000.0);
        assert_eq!(p.video, Some(("h264".into(), 1080, 1920)));
        assert_eq!(p.audio, Some(("aac".into(), 48000, 2)));
    }

    #[test]
    fn refuses_what_is_not_on_the_list() {
        assert!(one_of("mp4", &["mp4"]).is_ok());
        assert!(one_of("-i /etc/passwd", &["mp4"]).is_err());
        assert!(finite(f64::NAN).is_err());
        assert!(finite(-1.0).is_err());
    }
}
