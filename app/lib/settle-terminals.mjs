export async function closeLeftovers(seat, { tiedShells, foregroundOf, closeShell, seatServers, stopServer, stopRunning = false }) {
  const closed = [];
  const stopped = [];
  if (!seat?.name || seat.where !== "local") return { closed, stopped };
  for (const shell of tiedShells(seat.name)) {
    const seen = await foregroundOf(shell.name);
    if (!seen?.known || (seen.program && !stopRunning)) continue;
    await closeShell(shell);
    closed.push(shell.name);
  }
  if (!stopRunning) return { closed, stopped };
  for (const one of await seatServers(seat.name)) {
    const said = await stopServer(seat.name, one.pid);
    if (said?.ok) stopped.push(one.port);
  }
  return { closed, stopped };
}
