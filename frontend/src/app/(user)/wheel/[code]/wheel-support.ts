export interface WheelItemData {
  id: string;
  display_name: string;
  type: "onsite" | "website";
  weight: number;
}

export interface SpinResult {
  result_index: number;
  wheel_item: { id: string; display_name: string; type: string; display_text: string; redirect_url?: string };
}

export interface ClaimResultData {
  success: boolean;
  claim_id?: string;
  prize_type?: string;
  reward_code?: string;
  redirect_url?: string;
  message: string;
}

const COLORS = [
  "#0253cd", "#ffc69a", "#0048b5", "#8c4a00", "#789dff", "#ffb375",
  "#5c8bff", "#f395ee", "#618eff", "#e488df", "#0253cd", "#ffc69a",
];

function getTotalWeight(items: WheelItemData[], noPrizeWeight: number) {
  return items.reduce((sum, item) => sum + (item.weight || 0), 0) + (noPrizeWeight || 0);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
  label: string,
  currentAngle: number,
  segAngle: number,
) {
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(currentAngle + segAngle / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(label.length > 8 ? label.slice(0, 8) + ".." : label, radius * 0.6, 4);
  ctx.restore();
}

function drawCenterHub(ctx: CanvasRenderingContext2D, center: number) {
  ctx.beginPath();
  ctx.arc(center, center, 30, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(center, center, 24, 0, 2 * Math.PI);
  ctx.fillStyle = "#0253cd";
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function drawWheelCanvas(
  canvas: HTMLCanvasElement,
  items: WheelItemData[],
  noPrizeWeight: number,
  rotation: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || items.length === 0) return;

  const center = canvas.width / 2;
  const radius = center - 10;
  const totalWeight = getTotalWeight(items, noPrizeWeight);
  const segments = items.map((item, index) => ({
    name: item.display_name,
    pct: totalWeight > 0 ? ((item.weight || 0) / totalWeight) * 100 : 0,
    color: COLORS[index % COLORS.length],
  }));
  if (noPrizeWeight > 0 && totalWeight > 0) {
    segments.push({ name: "No Prize", pct: (noPrizeWeight / totalWeight) * 100, color: "#c8c8d0" });
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-center, -center);

  let currentAngle = -Math.PI / 2;
  segments.forEach((segment) => {
    const segAngle = (segment.pct / 100) * 2 * Math.PI;
    const endAngle = currentAngle + segAngle;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, currentAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (segment.pct >= 5) drawLabel(ctx, center, radius, segment.name, currentAngle, segAngle);
    currentAngle = endAngle;
  });

  ctx.restore();
  drawCenterHub(ctx, center);
}

export function getTargetAngleDeg(items: WheelItemData[], noPrizeWeight: number, targetIndex: number) {
  const totalWeight = getTotalWeight(items, noPrizeWeight);
  if (totalWeight === 0) return 0;
  if (targetIndex === -1) {
    const weightBefore = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    return 360 - ((weightBefore + noPrizeWeight / 2) / totalWeight) * 360;
  }
  const weightBefore = items.slice(0, targetIndex).reduce((sum, item) => sum + (item.weight || 0), 0);
  return 360 - ((weightBefore + (items[targetIndex]?.weight || 0) / 2) / totalWeight) * 360;
}
