const canvas = document.getElementById('arrowCanvas');
const ctx = canvas.getContext('2d');
const caption = document.getElementById('caption');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function drawArrow(x, y) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(100, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.98)';
  ctx.lineWidth = 6;                 // thicker line
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(100, 0);
  ctx.lineTo(80, -12);
  ctx.lineTo(80, 12);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.98)';
  ctx.fill();
  ctx.restore();
}

function showCaption(text) {
  caption.textContent = text;
  caption.style.display = text ? 'block' : 'none';
  if (text) setTimeout(() => (caption.style.display = 'none'), 4000);
}

document.getElementById('testArrow').addEventListener('click', () => {
  drawArrow(Math.round(window.innerWidth * 0.6), Math.round(window.innerHeight * 0.4));
});
document.getElementById('showCap').addEventListener('click', () => {
  const t = document.getElementById('capText').value || "Look here!";
  showCaption(t);
});
