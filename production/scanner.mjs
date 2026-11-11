import net from "node:net";
// clamd INSTREAM runs only on a private network. No original is stored or
// returned until the configured scanner positively reports a clean result.
export async function scanFile(
  bytes,
  {
    host = process.env.CLAMAV_HOST,
    port = Number(process.env.CLAMAV_PORT || 3310),
    timeout = 30000,
  } = {},
) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let answer = "";
    const finish = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeout, () =>
      finish(new Error("File scanner timed out")),
    );
    socket.on("error", () => finish(new Error("File scanner unavailable")));
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, offset + 65536),
          size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => {
      answer += chunk.toString();
      if (answer.length > 4096)
        return finish(new Error("Invalid scanner response"));
      if (answer.includes("\0") || answer.includes("\n"))
        finish(
          /^stream: OK[\0\n]/.test(answer)
            ? null
            : new Error(
                answer.includes("FOUND")
                  ? "Unsafe attachment rejected"
                  : "File scanner did not confirm a clean file",
              ),
        );
    });
    socket.on("end", () => {
      if (!answer.includes("\0") && !answer.includes("\n"))
        finish(new Error("Incomplete scanner response"));
    });
  });
}
