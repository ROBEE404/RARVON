//! Rarvon for desktop (beta), milestone 1.
//!
//! Serves Rarvon's own pages from this computer and opens them in a browser
//! "app mode" window (Edge or Chrome: a clean window with no tabs or address
//! bar). The program has no window of its own and exits when the Rarvon window
//! is closed.
//!
//! Safety, from the first line:
//! - listens on 127.0.0.1 only (never reachable from the network);
//! - answers only requests addressed to that exact host and port, which stops
//!   "DNS rebinding" (a bad website disguising itself as this computer);
//! - serves files only from Rarvon's own folder, never paths outside it;
//! - the one command it accepts ("still open") requires a secret key that only
//!   Rarvon's own page receives, so other websites can't use or detect it.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

mod native;
use native::Native;

const VERSION: &str = env!("CARGO_PKG_VERSION");
/// Rarvon's usual port. Staying on one address lets the window remember your
/// settings (theme, language) between launches; if it's taken, any free port is used.
const USUAL_PORT: u16 = 47821;
/// After the page says goodbye (window closed), exit unless it says hello again
/// this quickly (a reload does).
const AFTER_BYE: Duration = Duration::from_secs(8);
/// A minimized window may only say "still open" once a minute (browsers slow
/// hidden pages down); with no word for this long, the window is gone.
const SILENT_FOR: Duration = Duration::from_secs(180);
/// If no Rarvon window ever reports in (the browser failed to open), give up after this long.
const FIRST_CONTACT: Duration = Duration::from_secs(90);

/// What the Rarvon window last told the engine.
#[derive(Default)]
struct Contact {
    alive: Option<Instant>,
    bye: Option<Instant>,
}

fn main() {
    let web = match find_web_folder() {
        Some(dir) => dir,
        None => {
            eprintln!("Rarvon could not find its pages (a 'web' folder next to the program).");
            std::process::exit(1);
        }
    };

    // Rarvon already open? Open another window of it (same address, same settings).
    let window_wanted = std::env::var_os("BENCH_NO_WINDOW").is_none();
    if window_wanted && bench_already_running() {
        open_app_window(&format!("http://127.0.0.1:{USUAL_PORT}/"));
        return;
    }

    let token = secret_key();
    let server = Server::http(("127.0.0.1", USUAL_PORT))
        .or_else(|_| Server::http("127.0.0.1:0"))
        .expect("could not listen on this computer");
    let port = server.server_addr().to_ip().expect("ip address").port();
    let origin = format!("http://127.0.0.1:{port}");

    // Video and audio on this computer's hardware, when FFmpeg is next to Rarvon.
    let native = Native::find().map(Arc::new);
    let shared = Arc::new(Shared {
        web,
        host: format!("127.0.0.1:{port}"),
        token: token.clone(),
        contact: Mutex::new(Contact::default()),
        native: native.clone(),
    });
    {
        let shared = Arc::clone(&shared);
        thread::spawn(move || {
            for request in server.incoming_requests() {
                // One thread per request: a big upload never holds up the rest.
                let shared = Arc::clone(&shared);
                thread::spawn(move || handle(request, &shared));
            }
        });
    }
    let last_contact = &shared.contact;

    // BENCH_NO_WINDOW=1 (for testing): serve without opening a window.
    if window_wanted && !open_app_window(&format!("{origin}/")) {
        eprintln!("Rarvon could not open a window: Microsoft Edge or Google Chrome is needed.");
        std::process::exit(1);
    }

    // Stay alive while the Rarvon window is open.
    let started = Instant::now();
    loop {
        thread::sleep(Duration::from_secs(2));
        let contact = last_contact.lock().unwrap();
        let closed = match (contact.alive, contact.bye) {
            (_, Some(bye)) => bye.elapsed() > AFTER_BYE,
            (Some(alive), None) => alive.elapsed() > SILENT_FOR,
            // Without a window (testing) nobody reports in at first, so only silence after contact counts.
            (None, None) => window_wanted && started.elapsed() > FIRST_CONTACT,
        };
        if closed {
            break;
        }
    }
    if let Some(native) = native {
        native.shut_down();
    }
}

/// Everything the request threads share.
struct Shared {
    web: PathBuf,
    host: String,
    token: String,
    contact: Mutex<Contact>,
    native: Option<Arc<Native>>,
}

/// Whether a Rarvon Engine already answers on Rarvon's usual port.
fn bench_already_running() -> bool {
    use std::io::Write;
    use std::net::{SocketAddr, TcpStream};
    let addr = SocketAddr::from(([127, 0, 0, 1], USUAL_PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{USUAL_PORT}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut page = Vec::new();
    let _ = stream.take(256 * 1024).read_to_end(&mut page);
    String::from_utf8_lossy(&page).contains("window.__BENCH_APP__")
}

/// Rarvon's pages: `web` next to the program; while developing, `BENCH_WEB_DIR` or the site's `dist`.
fn find_web_folder() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(dir) = std::env::var("BENCH_WEB_DIR") {
        candidates.push(PathBuf::from(dir));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("web"));
        }
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist"));
    candidates
        .into_iter()
        .find(|d| d.join("index.html").is_file())
        .and_then(|d| d.canonicalize().ok())
}

/// 32 random bytes as hex, from the operating system's secure random source.
fn secret_key() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("secure random numbers");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn reply(request: Request, status: u16, body: &str) {
    let _ = request.respond(Response::from_string(body).with_status_code(StatusCode(status)));
}

fn reply_json(request: Request, result: Result<serde_json::Value, String>) {
    let (status, body) = match result {
        Ok(v) => (200, v.to_string()),
        Err(e) => (400, serde_json::json!({ "error": e }).to_string()),
    };
    let _ = request.respond(
        Response::from_string(body).with_status_code(StatusCode(status)).with_header(header("Content-Type", "application/json")),
    );
}

fn read_json<T: serde::de::DeserializeOwned>(request: &mut Request) -> Result<T, String> {
    let mut body = String::new();
    request.as_reader().take(64 * 1024).read_to_string(&mut body).map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

/// The engine's own commands (all need the secret key in a header).
fn handle_native(mut request: Request, path: &str, url: &str, native: &Arc<Native>) {
    #[derive(serde::Deserialize)]
    struct Ask {
        file: Option<String>,
        codec: Option<String>,
    }
    let query = |name: &str| {
        url.split_once('?')
            .and_then(|(_, q)| q.split('&').find_map(|kv| kv.strip_prefix(&format!("{name}=")[..]).map(str::to_string)))
            .unwrap_or_default()
    };
    let method = request.method().clone();
    match (method, path) {
        (Method::Post, "/__bench/upload") => {
            let ext = query("ext");
            let result = native.upload(&mut request.as_reader(), &ext);
            reply_json(request, result)
        }
        (Method::Post, "/__bench/probe") => {
            let result = read_json::<Ask>(&mut request).and_then(|a| native.probe_json(&a.file.unwrap_or_default()));
            reply_json(request, result)
        }
        (Method::Post, "/__bench/thumbnail") => {
            match read_json::<Ask>(&mut request).and_then(|a| native.thumbnail(&a.file.unwrap_or_default())) {
                Ok(jpeg) => {
                    let _ = request.respond(Response::from_data(jpeg).with_header(header("Content-Type", "image/jpeg")));
                }
                Err(e) => reply_json(request, Err(e)),
            }
        }
        (Method::Post, "/__bench/can-encode") => {
            let result = read_json::<Ask>(&mut request).map(|a| native.can_encode(&a.codec.unwrap_or_default()));
            reply_json(request, result)
        }
        (Method::Post, "/__bench/job") => {
            let result = read_json::<native::JobSpec>(&mut request).and_then(|spec| native.start(spec));
            reply_json(request, result)
        }
        (Method::Get, p) if p.starts_with("/__bench/job/") && p.ends_with("/result") => {
            let id = &p["/__bench/job/".len()..p.len() - "/result".len()];
            match native.take_result(id).and_then(|(file, mime)| fs::File::open(&file).map(|f| (f, mime)).map_err(|e| e.to_string())) {
                Ok((file, mime)) => {
                    let _ = request.respond(Response::from_file(file).with_header(header("Content-Type", mime)));
                    native.forget_job(id);
                }
                Err(e) => reply_json(request, Err(e)),
            }
        }
        (Method::Get, p) if p.starts_with("/__bench/job/") => {
            let result = native.status(&p["/__bench/job/".len()..]);
            reply_json(request, result)
        }
        (Method::Post, p) if p.starts_with("/__bench/job/") && p.ends_with("/cancel") => {
            let result = native.cancel(&p["/__bench/job/".len()..p.len() - "/cancel".len()]);
            reply_json(request, result)
        }
        _ => reply(request, 404, "Not found"),
    }
}

fn handle(request: Request, shared: &Shared) {
    let (web, host, token, last_contact) = (&shared.web, &shared.host, &shared.token, &shared.contact);
    // Only requests addressed exactly to this computer and port.
    let host_ok = request.headers().iter().any(|h| h.field.equiv("Host") && h.value.as_str() == host);
    if !host_ok {
        return reply(request, 403, "Forbidden");
    }

    let url = request.url().to_string();
    let path = url.split(['?', '#']).next().unwrap_or("/").to_string();

    // "Still open" and "goodbye" from Rarvon's own page, with the secret key.
    if path == "/__bench/alive" || path == "/__bench/bye" {
        let in_header = request.headers().iter().any(|h| h.field.equiv("X-Rarvon-Key") && h.value.as_str() == token);
        // A goodbye is sent as the window closes, which can only carry the key in the address.
        let in_query = url.split_once('?').is_some_and(|(_, q)| q.split('&').any(|p| p == format!("key={token}")));
        if *request.method() != Method::Post || !(in_header || in_query) {
            return reply(request, 403, "Forbidden");
        }
        let mut contact = last_contact.lock().unwrap();
        if path == "/__bench/alive" {
            contact.alive = Some(Instant::now());
            contact.bye = None;
        } else {
            contact.bye = Some(Instant::now());
        }
        drop(contact);
        return reply(request, 204, "");
    }

    if path.starts_with("/__bench/") {
        let key_ok = request.headers().iter().any(|h| h.field.equiv("X-Rarvon-Key") && h.value.as_str() == token);
        return match (&shared.native, key_ok) {
            (Some(native), true) => handle_native(request, &path, &url, native),
            (None, true) => reply(request, 404, "Not found"),
            _ => reply(request, 403, "Forbidden"),
        };
    }

    if *request.method() != Method::Get && *request.method() != Method::Head {
        return reply(request, 405, "Method not allowed");
    }

    // Find the file, never outside Rarvon's own folder.
    let decoded = percent_encoding::percent_decode_str(&path).decode_utf8_lossy().to_string();
    let relative = Path::new(decoded.trim_start_matches('/'));
    if relative.components().any(|c| !matches!(c, Component::Normal(_))) {
        return reply(request, 400, "Bad request");
    }
    let mut file = web.join(relative);
    let is_page = file.extension().is_none();
    if file.is_dir() || (is_page && !file.is_file()) {
        // Pages like /tools/video/convert are all served by index.html.
        file = web.join("index.html");
    }
    let Ok(mut body) = fs::read(&file) else {
        return reply(request, 404, "Not found");
    };

    let name = file.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name == "index.html" {
        // Tell Rarvon's page it is running in the app, with the key for "still open".
        let marker = format!(
            "<script>window.__BENCH_APP__={{version:\"{VERSION}\",key:\"{token}\",ffmpeg:{}}}</script></head>",
            shared.native.is_some()
        );
        body = String::from_utf8_lossy(&body).replacen("</head>", &marker, 1).into_bytes();
    }

    let len = body.len();
    let mut response = Response::new(StatusCode(200), Vec::new(), Cursor::new(body), Some(len), None)
        .with_header(header("Content-Type", content_type(&file)))
        .with_header(header("X-Content-Type-Options", "nosniff"))
        .with_header(header("Referrer-Policy", "no-referrer"));
    let cache = if path.starts_with("/assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
    response = response.with_header(header("Cache-Control", cache));
    let _ = request.respond(response);
}

fn content_type(file: &Path) -> &'static str {
    match file.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "webmanifest" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "wasm" => "application/wasm",
        "txt" | "md" => "text/plain; charset=utf-8",
        "xml" => "application/xml",
        // OCR language data stays compressed: the OCR engine unpacks it itself.
        _ => "application/octet-stream",
    }
}

/// Opens Rarvon in a browser app window (no tabs or address bar), reusing the
/// browser already on the computer.
fn open_app_window(url: &str) -> bool {
    let program_files = |var: &str| std::env::var(var).ok().map(PathBuf::from);
    let mut browsers = Vec::new();
    for base in [program_files("ProgramFiles(x86)"), program_files("ProgramFiles"), program_files("LOCALAPPDATA")].into_iter().flatten() {
        browsers.push(base.join("Microsoft/Edge/Application/msedge.exe"));
        browsers.push(base.join("Google/Chrome/Application/chrome.exe"));
    }
    // Linux: whichever is installed.
    for name in ["microsoft-edge", "google-chrome", "chromium", "chromium-browser"] {
        browsers.push(PathBuf::from(name));
    }
    for browser in browsers {
        let is_path = browser.components().count() > 1;
        if is_path && !browser.is_file() {
            continue;
        }
        if Command::new(&browser).arg(format!("--app={url}")).arg("--new-window").spawn().is_ok() {
            return true;
        }
    }
    false
}
