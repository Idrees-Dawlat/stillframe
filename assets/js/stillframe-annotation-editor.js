(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var defaultColor = '#ef4444';
	var defaultSize = 4;

	function unitVector(x1, y1, x2, y2) {
		var dx = x2 - x1;
		var dy = y2 - y1;
		var length = Math.sqrt(dx * dx + dy * dy);
		if (!length) {
			return null;
		}
		return { x: dx / length, y: dy / length, length: length };
	}

	function drawArrow(ctx, x1, y1, x2, y2, lineWidth, unit) {
		var dir = unitVector(x1, y1, x2, y2);
		if (!dir || dir.length < 2 * unit) {
			return;
		}
		var head = Math.min(dir.length * 0.7, Math.max(16 * unit, lineWidth * 4.6));
		var wing = head * 0.42;
		var baseX = x2 - dir.x * head;
		var baseY = y2 - dir.y * head;

		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(baseX + dir.x * head * 0.25, baseY + dir.y * head * 0.25);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(x2, y2);
		ctx.lineTo(baseX - dir.y * wing, baseY + dir.x * wing);
		ctx.lineTo(baseX + dir.y * wing, baseY - dir.x * wing);
		ctx.closePath();
		ctx.fill();
		ctx.lineWidth = lineWidth * 0.5;
		ctx.stroke();
	}

	function drawPen(ctx, points, width, height, lineWidth) {
		if (!points || !points.length) {
			return;
		}
		var startX = points[0].x * width;
		var startY = points[0].y * height;
		if (points.length === 1) {
			ctx.beginPath();
			ctx.arc(startX, startY, Math.max(lineWidth / 2, 1), 0, Math.PI * 2);
			ctx.fill();
			return;
		}
		ctx.beginPath();
		ctx.moveTo(startX, startY);
		for (var i = 1; i < points.length - 1; i++) {
			var cx = points[i].x * width;
			var cy = points[i].y * height;
			var mx = (cx + points[i + 1].x * width) / 2;
			var my = (cy + points[i + 1].y * height) / 2;
			ctx.quadraticCurveTo(cx, cy, mx, my);
		}
		var last = points[points.length - 1];
		ctx.lineTo(last.x * width, last.y * height);
		ctx.stroke();
	}

	function drawMark(ctx, mark, width, height, unit) {
		var color = mark.color || defaultColor;
		var lineWidth = (mark.size || defaultSize) * unit;
		ctx.save();
		ctx.strokeStyle = color;
		ctx.fillStyle = color;
		ctx.lineWidth = lineWidth;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
		ctx.shadowBlur = 5 * unit;
		ctx.shadowOffsetY = 1.5 * unit;

		if (mark.type === 'pen') {
			drawPen(ctx, mark.points, width, height, lineWidth);
		} else if (mark.type === 'circle') {
			var x1 = mark.x1 * width;
			var y1 = mark.y1 * height;
			var x2 = mark.x2 * width;
			var y2 = mark.y2 * height;
			var rx = Math.abs(x2 - x1) / 2;
			var ry = Math.abs(y2 - y1) / 2;
			if (rx >= 0.5 || ry >= 0.5) {
				ctx.beginPath();
				ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
				ctx.stroke();
			}
		} else if (mark.type === 'arrow') {
			drawArrow(ctx, mark.x1 * width, mark.y1 * height, mark.x2 * width, mark.y2 * height, lineWidth, unit);
		}
		ctx.restore();
	}

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var marks = [];
		var tool = 'pen';
		var color = defaultColor;
		var size = defaultSize;
		var drawing = null;
		var canvas = document.createElement('canvas');
		var observer = null;

		canvas.className = 'stillframe-annotation-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		wrap.appendChild(canvas);

		function notify() {
			if (typeof settings.onChange === 'function') {
				settings.onChange();
			}
		}

		function displayScale() {
			var rect = canvas.getBoundingClientRect();
			if (!rect.width) {
				return window.devicePixelRatio || 1;
			}
			return canvas.width / rect.width;
		}

		function redraw() {
			var ctx = canvas.getContext('2d');
			if (!ctx) {
				return;
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			var unit = displayScale();
			marks.forEach(function (mark) {
				drawMark(ctx, mark, canvas.width, canvas.height, unit);
			});
			if (drawing) {
				drawMark(ctx, drawing, canvas.width, canvas.height, unit);
			}
		}

		function resizeCanvas() {
			var rect = image.getBoundingClientRect();
			var ratio = window.devicePixelRatio || 1;
			var width = Math.max(1, Math.round(rect.width * ratio));
			var height = Math.max(1, Math.round(rect.height * ratio));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			redraw();
		}

		function pointFromEvent(event) {
			var rect = canvas.getBoundingClientRect();
			if (!rect.width || !rect.height) {
				return { x: 0, y: 0 };
			}
			return {
				x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
				y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
			};
		}

		function constrain(point, event) {
			if (!event.shiftKey || !drawing || drawing.type === 'pen') {
				return point;
			}
			var rect = canvas.getBoundingClientRect();
			var dx = (point.x - drawing.x1) * rect.width;
			var dy = (point.y - drawing.y1) * rect.height;
			if (drawing.type === 'circle') {
				var side = Math.max(Math.abs(dx), Math.abs(dy));
				dx = dx < 0 ? -side : side;
				dy = dy < 0 ? -side : side;
			} else {
				var length = Math.sqrt(dx * dx + dy * dy);
				var step = Math.PI / 4;
				var angle = Math.round(Math.atan2(dy, dx) / step) * step;
				dx = Math.cos(angle) * length;
				dy = Math.sin(angle) * length;
			}
			return {
				x: Math.min(1, Math.max(0, drawing.x1 + dx / rect.width)),
				y: Math.min(1, Math.max(0, drawing.y1 + dy / rect.height))
			};
		}

		function onPointerDown(event) {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			var point = pointFromEvent(event);
			if (tool === 'pen') {
				drawing = { type: 'pen', color: color, size: size, points: [point] };
			} else {
				drawing = { type: tool, color: color, size: size, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
			}
			redraw();
		}

		function onPointerMove(event) {
			if (!drawing) {
				return;
			}
			event.preventDefault();
			var point = pointFromEvent(event);
			if (drawing.type === 'pen') {
				var last = drawing.points[drawing.points.length - 1];
				if (last && Math.abs(last.x - point.x) < 0.0008 && Math.abs(last.y - point.y) < 0.0008) {
					return;
				}
				drawing.points.push(point);
			} else {
				point = constrain(point, event);
				drawing.x2 = point.x;
				drawing.y2 = point.y;
			}
			redraw();
		}

		function onPointerUp(event) {
			if (!drawing) {
				return;
			}
			if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
				canvas.releasePointerCapture(event.pointerId);
			}
			marks.push(drawing);
			drawing = null;
			redraw();
			notify();
		}

		function onPointerCancel() {
			drawing = null;
			redraw();
		}

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerCancel);

		if (typeof window.ResizeObserver === 'function') {
			observer = new window.ResizeObserver(function () {
				resizeCanvas();
			});
			observer.observe(image);
		}

		window.addEventListener('resize', resizeCanvas);
		window.requestAnimationFrame(resizeCanvas);

		return {
			setTool: function (next) {
				if (next === 'pen' || next === 'circle' || next === 'arrow') {
					tool = next;
				}
			},
			setColor: function (next) {
				if (typeof next === 'string' && /^#[0-9a-f]{6}$/i.test(next)) {
					color = next;
				}
			},
			setSize: function (next) {
				var value = parseFloat(next);
				if (value > 0 && value <= 16) {
					size = value;
				}
			},
			undo: function () {
				if (!marks.length) {
					return;
				}
				marks.pop();
				drawing = null;
				redraw();
				notify();
			},
			clear: function () {
				marks = [];
				drawing = null;
				redraw();
				notify();
			},
			hasMarks: function () {
				return marks.length > 0;
			},
			flatten: function () {
				return new Promise(function (resolve, reject) {
					if (!image.naturalWidth || !image.naturalHeight) {
						reject(new Error('image'));
						return;
					}
					var exportCanvas = document.createElement('canvas');
					exportCanvas.width = image.naturalWidth;
					exportCanvas.height = image.naturalHeight;
					var ctx = exportCanvas.getContext('2d');
					if (!ctx) {
						reject(new Error('canvas'));
						return;
					}
					ctx.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);
					var rect = image.getBoundingClientRect();
					var unit = rect.width ? (image.naturalWidth / rect.width) : 1;
					marks.forEach(function (mark) {
						drawMark(ctx, mark, exportCanvas.width, exportCanvas.height, unit);
					});
					exportCanvas.toBlob(function (blob) {
						if (!blob) {
							reject(new Error('blob'));
							return;
						}
						resolve(blob);
					}, 'image/png');
				});
			},
			destroy: function () {
				canvas.removeEventListener('pointerdown', onPointerDown);
				canvas.removeEventListener('pointermove', onPointerMove);
				canvas.removeEventListener('pointerup', onPointerUp);
				canvas.removeEventListener('pointercancel', onPointerCancel);
				window.removeEventListener('resize', resizeCanvas);
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				if (canvas.parentNode) {
					canvas.parentNode.removeChild(canvas);
				}
				marks = [];
				drawing = null;
			}
		};
	};
})();
