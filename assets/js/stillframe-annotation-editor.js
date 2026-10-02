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

	var BOX_TYPES = { circle: 1, rect: 1, highlight: 1, blur: 1 };

	function textSize(mark, unit) {
		return (12 + (mark.size || defaultSize) * 2.5) * unit;
	}

	function drawBox(ctx, mark, width, height) {
		var x = Math.min(mark.x1, mark.x2) * width;
		var y = Math.min(mark.y1, mark.y2) * height;
		var w = Math.abs(mark.x2 - mark.x1) * width;
		var h = Math.abs(mark.y2 - mark.y1) * height;
		return { x: x, y: y, w: w, h: h };
	}

	function drawBlur(ctx, mark, width, height, unit, image) {
		var box = drawBox(ctx, mark, width, height);
		if (!image || !image.naturalWidth || box.w < 2 || box.h < 2) {
			return;
		}
		var block = Math.max(8, 7 * unit);
		var tw = Math.max(1, Math.round(box.w / block));
		var th = Math.max(1, Math.round(box.h / block));
		var tmp = document.createElement('canvas');
		tmp.width = tw;
		tmp.height = th;
		var tctx = tmp.getContext('2d');
		if (!tctx) {
			return;
		}
		var kx = image.naturalWidth / width;
		var ky = image.naturalHeight / height;
		tctx.drawImage(image, box.x * kx, box.y * ky, box.w * kx, box.h * ky, 0, 0, tw, th);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tmp, 0, 0, tw, th, box.x, box.y, box.w, box.h);
	}

	function drawStep(ctx, mark, width, height, unit) {
		var radius = (9 + (mark.size || defaultSize) * 1.5) * unit;
		var cx = mark.x1 * width;
		var cy = mark.y1 * height;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.lineWidth = 2 * unit;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		ctx.shadowColor = 'transparent';
		ctx.fillStyle = '#ffffff';
		ctx.font = '700 ' + Math.round(radius * 1.1) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(mark.n || 1), cx, cy + radius * 0.05);
	}

	function drawText(ctx, mark, width, height, unit) {
		if (!mark.text) {
			return;
		}
		var px = textSize(mark, unit);
		ctx.font = '700 ' + Math.round(px) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.lineWidth = Math.max(3, px / 5);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
		ctx.shadowColor = 'transparent';
		ctx.strokeText(mark.text, mark.x1 * width, mark.y1 * height);
		ctx.fillText(mark.text, mark.x1 * width, mark.y1 * height);
	}

	function drawMark(ctx, mark, width, height, unit, image) {
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
		} else if (mark.type === 'rect') {
			var rb = drawBox(ctx, mark, width, height);
			if (rb.w >= 1 || rb.h >= 1) {
				ctx.lineJoin = 'miter';
				ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
			}
		} else if (mark.type === 'highlight') {
			var hb = drawBox(ctx, mark, width, height);
			ctx.shadowColor = 'transparent';
			ctx.globalAlpha = 0.35;
			ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
		} else if (mark.type === 'blur') {
			ctx.shadowColor = 'transparent';
			drawBlur(ctx, mark, width, height, unit, image);
		} else if (mark.type === 'step') {
			drawStep(ctx, mark, width, height, unit);
		} else if (mark.type === 'text') {
			drawText(ctx, mark, width, height, unit);
		}
		ctx.restore();
	}

	api.flattenImageAndMarks = function (image, marksList, displayWidth) {
		return new Promise(function (resolve, reject) {
			if (!image || !image.naturalWidth || !image.naturalHeight) {
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
			var unit = displayWidth ? (image.naturalWidth / displayWidth) : 1;
			(marksList || []).forEach(function (mark) {
				drawMark(ctx, mark, exportCanvas.width, exportCanvas.height, unit, image);
			});
			exportCanvas.toBlob(function (blob) {
				if (!blob) {
					reject(new Error('blob'));
					return;
				}
				resolve(blob);
			}, 'image/png');
		});
	};

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
				drawMark(ctx, mark, canvas.width, canvas.height, unit, image);
			});
			if (drawing) {
				drawMark(ctx, drawing, canvas.width, canvas.height, unit, image);
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
			if (!event.shiftKey || !drawing || drawing.type === 'pen' || !('x2' in drawing)) {
				return point;
			}
			var rect = canvas.getBoundingClientRect();
			var dx = (point.x - drawing.x1) * rect.width;
			var dy = (point.y - drawing.y1) * rect.height;
			if (BOX_TYPES[drawing.type]) {
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

		function beginText(event, point) {
			var input = document.createElement('input');
			var done = false;
			var px = textSize({ size: size }, 1);
			input.type = 'text';
			input.className = 'stillframe-text-input';
			input.setAttribute('aria-label', 'Annotation text');
			input.style.cssText = 'position:fixed;z-index:1000002;margin:0;padding:0 2px;min-width:80px;height:' + Math.round(px * 1.3) + 'px;' +
				'left:' + Math.round(event.clientX) + 'px;top:' + Math.round(event.clientY) + 'px;' +
				'font:700 ' + Math.round(px) + 'px -apple-system,"Segoe UI",Roboto,sans-serif;color:' + color + ';' +
				'background:rgba(255,255,255,.85);border:1px dashed ' + color + ';border-radius:2px;outline:none;box-shadow:none;';
			function finish(commit) {
				if (done) {
					return;
				}
				done = true;
				var value = input.value.trim();
				if (input.parentNode) {
					input.parentNode.removeChild(input);
				}
				if (commit && value) {
					marks.push({ type: 'text', text: value, color: color, size: size, x1: point.x, y1: point.y });
					redraw();
					notify();
				}
			}
			input.addEventListener('keydown', function (e) {
				e.stopPropagation();
				if (e.key === 'Enter') {
					e.preventDefault();
					finish(true);
				} else if (e.key === 'Escape') {
					e.preventDefault();
					finish(false);
				}
			});
			input.addEventListener('blur', function () {
				finish(true);
			});
			document.body.appendChild(input);
			window.setTimeout(function () {
				input.focus();
			}, 0);
		}

		function onPointerDown(event) {
			if (event.button !== 0) {
				return;
			}
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			var point = pointFromEvent(event);
			if (tool === 'step') {
				canvas.releasePointerCapture(event.pointerId);
				var count = marks.filter(function (m) { return m.type === 'step'; }).length;
				marks.push({ type: 'step', n: count + 1, color: color, size: size, x1: point.x, y1: point.y });
				redraw();
				notify();
				return;
			}
			if (tool === 'text') {
				canvas.releasePointerCapture(event.pointerId);
				beginText(event, point);
				return;
			}
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
				if (next === 'pen' || next === 'circle' || next === 'arrow' || next === 'rect' || next === 'highlight' || next === 'text' || next === 'step' || next === 'blur') {
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
			getMarks: function () {
				try {
					return JSON.parse(JSON.stringify(marks));
				} catch (e) {
					return marks.slice();
				}
			},
			setMarks: function (newMarks) {
				try {
					marks = Array.isArray(newMarks) ? JSON.parse(JSON.stringify(newMarks)) : [];
				} catch (e) {
					marks = Array.isArray(newMarks) ? newMarks.slice() : [];
				}
				drawing = null;
				redraw();
				notify();
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
						drawMark(ctx, mark, exportCanvas.width, exportCanvas.height, unit, image);
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
