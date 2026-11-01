// The heading of a car drawn from its raw positions (map3d.js updateCars, off the steadied tracks), v0.53.
// From the positions' velocity (mx, mz m/s) – but turned to face back only when the car really reverses: its telemetry
// under REVERSE_KMH (as on the steadied track: map3d.js `back`). The feed's positions step back where no car does –
// Monaco 2025's pit exit 1–1.5 m in 0.2 s at 35–60 km/h, China 2025's pit entry 25–48 m at 180 km/h, every car at the
// same spot – and their velocity there points back: the car turned 160–180° for a few frames. While the positions go back
// against a car the telemetry has moving on, its heading is kept (prevYaw). telKmh null: no telemetry – the velocity's.
export const REVERSE_KMH = 20;
export function rawYaw(prevYaw, mx, mz, telKmh) {
  const v = Math.atan2(mx, mz);
  if (prevYaw != null && telKmh != null && telKmh >= REVERSE_KMH && Math.cos(v - prevYaw) < 0) return prevYaw;
  return v;
}
