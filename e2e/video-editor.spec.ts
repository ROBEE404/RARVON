import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test, expect, download, makeMp4, makeWav, makeImage, makeWebm, mediaInfo } from './helpers';

async function newProject(page: Page, name = 'Test edit') {
  await page.goto('/tools/video/editor');
  await page.getByRole('button', { name: /New project/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New video project' });
  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('video-editor')).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test.describe('Video Editor', () => {
  test('build a timeline, edit it and export an MP4 with sound', async ({ page }) => {
    const clip = await makeMp4(page, 4);
    await newProject(page);

    await page.getByTestId('editor-import').setInputFiles([clip, makeWav(3), await makeImage(page, { width: 800, height: 600, name: 'photo.png' })]);
    await expect(page.getByTestId('media-item')).toHaveCount(3);

    await page.getByRole('button', { name: 'Add clip.mp4 to the timeline' }).click();
    await page.getByRole('button', { name: 'Add photo.png to the timeline' }).click();
    await page.getByRole('button', { name: 'Add tone.wav to the timeline' }).click();
    await expect(page.locator('[data-clip=video]')).toHaveCount(2);
    await expect(page.locator('[data-clip=audio]')).toHaveCount(1);
    // 4 s video + 3 s picture.
    await expect(page.getByTestId('time-display')).toHaveText(/\/ 0:0(6\.[5-9]|7)/);

    // Split the video at about 2 s, then remove the sound of the second part.
    await page.locator('[data-clip=video]').first().click({ position: { x: 5, y: 30 } });
    const ruler = page.getByLabel('Timeline ruler');
    const box = (await ruler.boundingBox())!;
    await page.mouse.click(box.x + 2 * 40, box.y + box.height / 2); // 40 px per second
    await page.locator('[data-clip=video]').first().click({ position: { x: 5, y: 30 } });
    await page.keyboard.press('s');
    await expect(page.locator('[data-clip=video]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Remove audio' }).click();
    await expect(page.locator('[data-clip=video]').nth(1)).toContainText('Muted');

    // Undo and redo the mute.
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-clip=video]').nth(1)).not.toContainText('Muted');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-clip=video]').nth(1)).toContainText('Muted');

    // Text, including Arabic.
    await page.getByRole('button', { name: 'Add text' }).click();
    await page.getByLabel('Text', { exact: true }).fill('Hello مرحبا');
    await expect(page.locator('[data-clip=text]')).toContainText('Hello');

    await expect(page.getByTestId('save-status')).toHaveText('Saved to this browser');

    // Export.
    await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: /^720p \(HD\)/ }).click();
    await page.getByRole('button', { name: 'Export now' }).click();
    const done = page.getByTestId('queue-item').first().getByRole('link', { name: 'Download' });
    await expect(done).toBeVisible({ timeout: 60_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), done.click()]);
    const out = { name: dl.suggestedFilename(), buffer: await readFile((await dl.path())!) };
    expect(out.name).toBe('Test edit.mp4');
    const info = await mediaInfo(page, out.buffer, 'video/mp4');
    expect(info.width).toBe(1280);
    expect(info.height).toBe(720);
    expect(info.duration).toBeGreaterThan(6.5);
    expect(info.duration).toBeLessThan(7.6);
    expect(out.buffer.includes(Buffer.from('soun')), 'MP4 has an audio track').toBe(true);
    await page.getByTestId('tab-button-edit').click();

    // Leaving asks what to do; keeping it lists the project.
    await page.getByRole('button', { name: 'Exit' }).click();
    const exit = page.getByRole('dialog', { name: 'Before you leave' });
    await expect(exit).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exit, 'the choice dialog cannot be dismissed with Esc').toBeVisible();
    await exit.getByRole('button', { name: /Keep it saved/ }).click();
    await expect(page).toHaveURL(/\/tools\/video\/editor$/);
    await expect(page.getByTestId('project-row')).toHaveCount(1);
    await expect(page.getByTestId('project-row')).toContainText('Test edit');

    // Reopening restores the timeline.
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.locator('[data-clip=video]')).toHaveCount(3);
    await expect(page.locator('[data-clip=text]')).toHaveCount(1);
  });

  test('no prompt when nothing was edited', async ({ page }) => {
    await newProject(page, 'Untouched');
    await page.getByRole('button', { name: 'Exit' }).click();
    await expect(page).toHaveURL(/\/tools\/video\/editor$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closing the tab warns, and an unsaved project is offered for recovery', async ({ page, context }) => {
    await newProject(page, 'Unsaved');
    await page.getByRole('button', { name: 'Add text' }).click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved to this browser');
    const id = page.url().split('/').pop()!;

    // Make it a folder-only project (its browser copy is just a recovery copy), as a folder picker can't run here.
    await page.evaluate(async (pid) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('video-projects');
      const fh = await (await root.getDirectoryHandle(pid)).getFileHandle('project.json');
      const p = JSON.parse(await (await fh.getFile()).text());
      Object.assign(p, { browserSave: false, folderSave: true, pendingChoice: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(p));
      await w.close();
    }, id);

    const dialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const d = await dialog;
    expect(d.type()).toBe('beforeunload');
    await d.accept();

    const next = await context.newPage();
    await next.goto('/tools/video/editor');
    await next.evaluate((pid) => localStorage.removeItem(`bench-video-open:${pid}`), id);
    await next.reload();
    const recovery = next.getByRole('dialog', { name: 'You left a project without saving' });
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Unsaved');
    await recovery.getByRole('button', { name: /Discard project/ }).click();
    await expect(recovery).toHaveCount(0);
    await expect(next.getByTestId('project-row')).toHaveCount(0);
  });

  test('a project file downloads and opens again', async ({ page }) => {
    await newProject(page, 'Portable');
    await page.getByTestId('editor-import').setInputFiles([await makeImage(page, { width: 640, height: 360, name: 'pic.png' })]);
    await page.getByRole('button', { name: 'Add pic.png to the timeline' }).click();
    const file = await download(page, /Project file/);
    expect(file.name).toBe('Portable.rarvonvideo');

    await page.getByRole('button', { name: 'Exit' }).click();
    await page.getByRole('dialog', { name: 'Before you leave' }).getByRole('button', { name: /Discard project/ }).click();
    await page.getByRole('button', { name: 'Discard project', exact: true }).click();
    await expect(page.getByTestId('project-row')).toHaveCount(0);

    await page.getByTestId('open-project-file').setInputFiles({ name: file.name, mimeType: 'application/zip', buffer: file.buffer });
    await expect(page.getByTestId('video-editor')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Portable' })).toBeVisible();
    await expect(page.locator('[data-clip=video]')).toHaveCount(1);
  });

  test('Trim Video hands its video to the editor, and the editor links back to Trim', async ({ page }) => {
    const clip = await makeWebm(page, 3);
    await page.goto('/tools/video/trim');
    await page.locator('input[type=file]').first().setInputFiles(clip);
    await page.getByRole('button', { name: 'Open this video in Video Editor →' }).click();
    const dialog = page.getByRole('dialog', { name: 'New video project' });
    await expect(dialog).toContainText('Starting with clip.webm');
    await expect(dialog.getByLabel('Project name')).toHaveValue('clip');
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByTestId('media-item')).toHaveCount(1);
    await expect(page.locator('[data-clip=video]')).toHaveCount(1);

    await page.goto('/tools/video/editor');
    await page.getByRole('link', { name: 'Quick trim →' }).click();
    await expect(page).toHaveURL(/\/tools\/video\/trim$/);
  });
  test('Audio tab finds pauses and removes them, with or without the picture', async ({ page }) => {
    // A 7.5 s clip: tone 1.5 s, pause 1.2 s, tone 1 s, breath 0.3 s, tone 1 s, pause 1.5 s, tone 1 s.
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const g = c.getContext('2d')!;
      const ac = new AudioContext();
      await ac.resume();
      while (ac.currentTime === 0) await new Promise((r) => setTimeout(r, 20));
      const osc = ac.createOscillator();
      osc.frequency.value = 220;
      const gain = ac.createGain();
      gain.gain.value = 0;
      const dest = ac.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const iv = setInterval(() => { g.fillStyle = `hsl(${Math.random() * 360},60%,40%)`; g.fillRect(0, 0, 320, 180); }, 33);
      rec.start();
      let t = ac.currentTime + 0.05;
      for (const [d, on] of [[1.5, 1], [1.2, 0], [1, 1], [0.3, 0], [1, 1], [1.5, 0], [1, 1]]) {
        gain.gain.setValueAtTime(on ? 0.5 : 0, t);
        t += d;
      }
      await new Promise((r) => setTimeout(r, 7700));
      rec.stop();
      await new Promise((r) => (rec.onstop = r));
      clearInterval(iv);
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let s = '';
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    });
    await newProject(page, 'Pauses');
    await page.getByTestId('editor-import').setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') });
    await page.getByRole('button', { name: 'Add talk.webm to the timeline' }).click();
    await expect(page.locator('[data-clip=video]')).toHaveCount(1);

    await page.getByTestId('tab-button-audio').click();
    await expect(page.getByTestId('audio-tab')).toBeVisible();
    await expect(page.getByTestId('audio-summary')).toContainText('2 pauses found', { timeout: 30_000 });

    // Cut together with the picture: three pieces remain and the video gets shorter.
    await page.getByRole('button', { name: 'Remove all silences' }).click();
    await page.getByTestId('tab-button-edit').click();
    await expect(page.locator('[data-clip=video]')).toHaveCount(3);
    await expect(page.getByTestId('time-display')).toHaveText(/\/ 0:0[5-6]\./);

    // Undo, then cut only the sound: the picture keeps its length, cut parts are muted.
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-clip=video]')).toHaveCount(1);
    await page.getByTestId('tab-button-audio').click();
    await expect(page.getByTestId('audio-summary')).toContainText('2 pauses found');
    await page.getByTestId('cut-video').uncheck();
    await page.getByRole('button', { name: 'Remove all silences' }).click();
    await page.getByTestId('tab-button-edit').click();
    await expect(page.locator('[data-clip=video]')).toHaveCount(5);
    await expect(page.locator('[data-clip=video]').nth(1)).toContainText('Muted');
    await expect(page.getByTestId('time-display')).toHaveText(/\/ 0:07\./);
  });
  test('Export tab: named export, preset, size estimate, and a queue with audio only', async ({ page }) => {
    const clip = await makeMp4(page, 3);
    await newProject(page, 'Exports');
    await page.getByTestId('editor-import').setInputFiles([clip]);
    await page.getByRole('button', { name: 'Add clip.mp4 to the timeline' }).click();

    // The top bar's Export button opens the Export tab.
    await page.locator('header').getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByTestId('export-tab')).toBeVisible();
    await expect(page.getByTestId('export-name')).toHaveValue('Exports');
    await expect(page.getByTestId('export-estimate')).not.toHaveText('');

    // A custom name and 720p, exported right away.
    await page.getByTestId('export-name').fill('My first export');
    await page.getByRole('button', { name: /^720p \(HD\)/ }).click();
    await page.getByRole('button', { name: 'Export now' }).click();
    const first = page.getByTestId('queue-item').first();
    await expect(first.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
    await expect(first).toContainText('My first export.mp4');
    await page.screenshot({ path: 'test-results/export-tab.png' });
    const [dl] = await Promise.all([page.waitForEvent('download'), first.getByRole('link', { name: 'Download' }).click()]);
    expect(dl.suggestedFilename()).toBe('My first export.mp4');
    const info = await mediaInfo(page, await readFile((await dl.path())!), 'video/mp4');
    expect(info.width).toBe(1280);
    expect(info.height).toBe(720);

    // Queue an audio-only version and run the queue.
    await page.getByRole('button', { name: /^Audio only/ }).click();
    await page.getByTestId('export-name').fill('Just the sound');
    await page.getByRole('button', { name: '+ Add to queue' }).click();
    await expect(page.getByTestId('queue-item')).toHaveCount(2);
    await page.getByRole('button', { name: /Export all/ }).click();
    const second = page.getByTestId('queue-item').nth(1);
    await expect(second.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 60_000 });
    await expect(second).toContainText('Just the sound.mp3');

    // Switching tabs keeps the queue.
    await page.getByTestId('tab-button-edit').click();
    await page.getByTestId('tab-button-export').click();
    await expect(page.getByTestId('queue-item')).toHaveCount(2);
  });
  test('Settings tab: presets change the keys, a key can be re-recorded, and conflicts offer a swap', async ({ page }) => {
    await newProject(page, 'Keys');
    await page.getByTestId('editor-import').setInputFiles([await makeImage(page, { width: 640, height: 360, name: 'pic.png' })]);
    await page.getByRole('button', { name: 'Add pic.png to the timeline' }).click();

    await page.getByTestId('tab-button-settings').click();
    await expect(page.getByTestId('settings-tab')).toBeVisible();
    await expect(page.getByTestId('action-split')).toContainText('S');

    // DaVinci Resolve style: split is Ctrl+B.
    await page.getByTestId('preset-resolve').click();
    await expect(page.getByTestId('preset-resolve')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('action-split')).toContainText('Ctrl');
    await expect(page.getByTestId('action-split')).toContainText('B');
    await page.waitForTimeout(1000); // let the preset slide and key wave finish
    await page.screenshot({ path: 'test-results/settings-tab.png', fullPage: true });

    // The keys work in the Edit tab: S no longer splits, Ctrl+B does.
    await page.getByTestId('tab-button-edit').click();
    await page.locator('[data-clip=video]').first().click({ position: { x: 5, y: 30 } });
    const ruler = page.getByLabel('Timeline ruler');
    const box = (await ruler.boundingBox())!;
    await page.mouse.click(box.x + 1.5 * 40, box.y + box.height / 2);
    await page.locator('[data-clip=video]').first().click({ position: { x: 5, y: 30 } });
    await page.keyboard.press('s');
    await expect(page.locator('[data-clip=video]')).toHaveCount(1);
    await page.keyboard.press('Control+b');
    await expect(page.locator('[data-clip=video]')).toHaveCount(2);

    // Record a new key for Split: Ctrl+K. The preset becomes Custom.
    await page.getByTestId('tab-button-settings').click();
    await page.getByTestId('action-split').click();
    await expect(page.getByTestId('action-split')).toContainText('Press keys');
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('action-split')).toContainText('K');
    await expect(page.getByTestId('preset-custom')).toHaveAttribute('aria-checked', 'true');

    // Taking Undo's key asks first; swapping gives Undo the old Ctrl+K.
    await page.getByTestId('action-split').click();
    await page.keyboard.press('Control+z');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Undo');
    await alert.getByRole('button', { name: 'Swap them' }).click();
    await expect(page.getByTestId('action-split')).toContainText('Z');
    await expect(page.getByTestId('action-undo')).toContainText('K');

    // Saved on this device.
    await page.reload();
    await page.getByTestId('tab-button-settings').click();
    await expect(page.getByTestId('preset-custom')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('action-undo')).toContainText('K');
  });
});
