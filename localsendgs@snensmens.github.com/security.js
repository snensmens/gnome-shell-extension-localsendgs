import Gio from "gi://Gio";
import GLib from "gi://GLib";

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");
Gio._promisify(Gio.File.prototype, "replace_contents_async", "replace_contents_finish");

export async function createPrivateKey({ path, cancellable }) {
  const process = new Gio.Subprocess({
    argv: ["certtool", "--generate-privkey", "--no-text"],
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
  });
  process.init(cancellable);

  const cancelId = cancellable?.connect(() => process.force_exit());

  const [stdout, stderr] = await process.communicate_utf8_async(null, cancellable);

  cancellable?.disconnect(cancelId);

  if (process.get_exit_status() === 0) {
    const keyFile = Gio.File.new_for_path(path);

    await keyFile.replace_contents_async(
      new TextEncoder().encode(stdout.trim()),
      null, false, Gio.FileCreateFlags.NONE,
      cancellable,
    );

    print("created new private key");
    return true;
  }

  console.error(`failed to create private key: ${stderr.trim()}`);
}
