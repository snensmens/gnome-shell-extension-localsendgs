import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_async", "replace_contents_finish");


async function createFileFromSubprocess({ args, path, cancellable }) {
  try {
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

    const file = Gio.File.new_for_path(path);
    await file.replace_contents_async(
      new TextEncoder().encode(stdout.trim()),
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


export async function createPrivateKey({ path, cancellable }) {
  return await createFileFromSubprocess({
    args: ["certtool", "--generate-privkey", "--no-text"],
    path: path,
    cancellable: cancellable,
  });
}


export async function createCertificate({ path, key, template, cancellable }) {
  return await createFileFromSubprocess({
    args: ["certtool", "-s", "--load-privkey", key, "--template", template, "--no-text", "--verbose"],
    path: path,
    cancellable: cancellable,
  });
}
