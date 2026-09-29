(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var stroke = '#e85d04';

	function drawArrow(ctx, x1, y1, x2, y2, lineWidth) {
		var angle = Math.atan2(y2 - y1, x2 - x1);
		var head = Math.max(12, lineWidth * 4);
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(x2, y2);
		ctx.lineTo(
			x2 - head * Math.cos(angle - Math.PI / 7),
			y2 - head * Math.sin(angle - Math.PI / 7)
		);
		ctx.lineTo(
			x2 - head * Math.cos(angle + Math.PI / 7),
			y2 - head * Math.sin(angle + Math.PI / 7)
		);
		ctx.closePath();
		ctx.fill();
	}

	function drawMark(ctx, mark, width, height, lineWidth) {
		ctx.strokeStyle = stroke;
		ctx.fillStyle = stroke;
		ctx.lineWidth = lineWidth;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		if (mark.type === 'pen') {
			if (!mark.points || !mark.points.length) {
				return;
			}
			var startX = mark.points[0].x * width;
			var startY = mark.points[0].y * height;
			if (mark.points.length === 1) {
				ctx.beginPath();
				ctx.arc(startX, startY, Math.max(lineWidth / 2, 1), 0, Math.PI * 2);
				ctx.fill();
				return;
			}
			ctx.beginPath();
			ctx.moveTo(startX, startY);
			for (var i = 1; i < mark.points.length; i++) {
				ctx.lineTo(mark.points[i].x * width, mark.points[i].y * height);
			}
			ctx.stroke();
			return;
		}

		if (mark.type === 'circle') {
			var x1 = mark.x1 * width;
			var y1 = mark.y1 * height;
			var x2 = mark.x2 * width;
			var y2 = mark.y2 * height;
			var rx = Math.abs(x2 - x1) / 2;
			var ry = Math.abs(y2 - y1) / 2;
			if (rx < 0.5 && ry < 0.5) {
				return;
			}
			ctx.beginPath();
			ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
			ctx.stroke();
			return;
		}

		if (mark.type === 'arrow') {
			drawArrow(
				ctx,
				mark.x1 * width,
				mark.y1 * height,
				mark.x2 * width,
				mark.y2 * height,
				lineWidth
			);
		}
	}

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var marks = [];
		var tool = 'pen';
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
			var lineWidth = 3 * displayScale();
			marks.forEach(function (mark) {
				drawMark(ctx, mark, canvas.width, canvas.height, lineWidth);
			});
			if (drawing) {
				drawMark(ctx, drawing, canvas.width, canvas.height, lineWidth);
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

		function onPointerDown(event) {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			var point = pointFromEvent(event);
			if (tool === 'pen') {
				drawing = { type: 'pen', points: [point] };
			} else if (tool === 'circle') {
				drawing = { type: 'circle', x1: point.x, y1: point.y, x2: point.x, y2: point.y };
			} else {
				drawing = { type: 'arrow', x1: point.x, y1: point.y, x2: point.x, y2: point.y };
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
				if (last && Math.abs(last.x - point.x) < 0.001 && Math.abs(last.y - point.y) < 0.001) {
					return;
				}
				drawing.points.push(point);
			} else {
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
					var lineScale = rect.width ? (image.naturalWidth / rect.width) : 1;
					marks.forEach(function (mark) {
						drawMark(ctx, mark, exportCanvas.width, exportCanvas.height, 3 * lineScale);
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
