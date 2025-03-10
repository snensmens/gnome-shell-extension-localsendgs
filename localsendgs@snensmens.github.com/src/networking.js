import Gio from 'gi://Gio';

Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async", "communicate_utf8_finish");


export async function getLocalIpAddress() {
  const proc = new Gio.Subprocess({
    argv: ["hostname", "-I"],
    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
  });
  proc.init(null);

  try {
    const [stdout, stderr] = await proc.communicate_utf8_async(null, null);

    if (proc.get_exit_status() == 0) {
        return stdout.split(" ")[0]
    }
    else {
        throw stderr.trim();
    }
  } catch (e) {
    console.error(`fetching local ip address failed: ${e}`);
  }

  return null
}


export function createMulticastSocket({group, port}) {
  const socket = Gio.Socket.new(
    Gio.SocketFamily.IPV4,
    Gio.SocketType.DATAGRAM,
    Gio.SocketProtocol.UDP
  );
  socket.set_option(1, 2, 1); // enable reusing address bindings at socket level
  socket.set_blocking(false);
  socket.set_multicast_loopback(false); // we dont want to receive our own messages
  socket.bind(
    new Gio.InetSocketAddress({
      address: Gio.InetAddress.new_any(Gio.SocketFamily.IPV4),
      port: port
    }),
    true
  );
  socket.join_multicast_group(Gio.InetAddress.new_from_string(group), false, null);

  return socket;
}
