import Gio from "gi://Gio";
import GLib from "gi://GLib";

import { CryptoTool } from './enums.js'

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_async", "replace_contents_finish");


async function runSubprocess({ args, cancellable }) {
  const process = new Gio.Subprocess({
    argv: args,
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });
  process.init(cancellable);

  const cancelId = cancellable?.connect(() => process.force_exit());
  const [stdout, stderr] = await process.communicate_utf8_async(null, cancellable);

  cancellable?.disconnect(cancelId);

  if (process.get_exit_status() !== 0) {
    throw stderr.trim();
  }

  return stdout.trim();
}


async function createFileFromSubprocess({ args, path, cancellable }) {
  try {
    const stdout = await runSubprocess({
      args: args,
      cancellable: cancellable,
    });

    const file = Gio.File.new_for_path(path);
    await file.replace_contents_async(
      new TextEncoder().encode(stdout),
      null, false, Gio.FileCreateFlags.NONE,
      cancellable,
    );
    return true;
  }
  catch (error) {
    console.error(error);
  }

  return false;
}


export async function hasOpensslInstalled(cancellable) {
  try {
    await runSubprocess({
      args: ["which", "openssl"],
      cancellable: cancellable,
    });

    return true;
  }
  catch (e) {
    console.error(e);
    return false;
  }
}


export async function hasCerttoolInstalled(cancellable) {
  try {
    await runSubprocess({
      args: ["which", "certtool"],
      cancellable: cancellable,
    });

    return true;
  }
  catch (e) {
    console.error(e);
    return false;
  }
}


export async function createPrivateKey({ cryptoTool, path, cancellable }) {
  return await createFileFromSubprocess({
    args: cryptoTool === CryptoTool.OPENSSL ?
      ["openssl", "genrsa", "2048"] :
      ["certtool", "--generate-privkey", "--no-text"],
    path: `${path}/resources/key.pem`,
    cancellable: cancellable,
  });
}


export async function createCertificate({ cryptoTool, path, cancellable }) {
  const key = `${path}/resources/key.pem`;
  const template = `${path}/resources/cert-template.cfg`;

  return await createFileFromSubprocess({
    args: cryptoTool === CryptoTool.OPENSSL ?
      ["openssl", "req", "-x509", "-days", "365", "-key", key, "-subj", "/"] :
      ["certtool", "-s", "--load-privkey", key, "--template", template, "--no-text", "--verbose"],
    path: `${path}/resources/cert.pem`,
    cancellable: cancellable,
  });
}
