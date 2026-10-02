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

	var TOOLS = { select: 1, pen: 1, circle: 1, arrow: 1, rect: 1, highlight: 1, text: 1, step: 1, blur: 1 };
	var MAX_MARKS = 400;
	var MAX_PEN_POINTS = 3000;
	var HANDLE_PX = 9;
	var measureCtx = null;

	function measureText(mark, px) {
		if (!measureCtx) {
			measureCtx = document.createElement('canvas').getContext('2d');
		}
		measureCtx.font = '700 ' + Math.round(px) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
		return measureCtx.measureText(mark.text || '').width;
	}

	function copyMarks(list) {
		try {
			return JSON.parse(JSON.stringify(list));
		} catch (e) {
			return list.slice();
		}
	}

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var marks = [];
		var history = [];
		var selected = -1;
		var tool = 'pen';
		var color = defaultColor;
		var size = defaultSize;
		var drawing = null;
		var gesture = null;
		var editingText = false;
		var frame = 0;
		var canvas = document.createElement('canvas');
		var base = document.createElement('canvas');
		var baseDirty = true;
		var baseSkip = -1;
		var observer = null;

		canvas.className = 'stillframe-annotation-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		wrap.appendChild(canvas);

		function notify() {
			if (typeof settings.onChange === 'function') {
				settings.onChange();
			}
		}

		function snapshot() {
			history.push(JSON.stringify(marks));
			if (history.length > 100) {
				history.shift();
			}
		}

		function displayRect() {
			var rect = canvas.getBoundingClientRect();
			return { left: rect.left, top: rect.top, w: rect.width || 1, h: rect.height || 1 };
		}

		function displayScale() {
			var rect = canvas.getBoundingClientRect();
			if (!rect.width) {
				return window.devicePixelRatio || 1;
			}
			return canvas.width / rect.width;
		}

		/* Bounds in normalized (0..1) image space. */
		function boundsOf(mark) {
			var d = displayRect();
			var l;
			var t;
			var r;
			var b;
			if (mark.type === 'pen') {
				l = 1;
				t = 1;
				r = 0;
				b = 0;
				(mark.points || []).forEach(function (pt) {
					l = Math.min(l, pt.x);
					t = Math.min(t, pt.y);
					r = Math.max(r, pt.x);
					b = Math.max(b, pt.y);
				});
				var pad = ((mark.size || defaultSize) / 2) / d.w;
				return { l: l - pad, t: t - (pad * d.w / d.h), r: r + pad, b: b + (pad * d.w / d.h) };
			}
			if (mark.type === 'step') {
				var rad = 9 + (mark.size || defaultSize) * 1.5;
				return { l: mark.x1 - rad / d.w, t: mark.y1 - rad / d.h, r: mark.x1 + rad / d.w, b: mark.y1 + rad / d.h };
			}
			if (mark.type === 'text') {
				var px = textSize(mark, 1);
				return { l: mark.x1, t: mark.y1, r: mark.x1 + measureText(mark, px) / d.w, b: mark.y1 + px * 1.25 / d.h };
			}
			return {
				l: Math.min(mark.x1, mark.x2),
				t: Math.min(mark.y1, mark.y2),
				r: Math.max(mark.x1, mark.x2),
				b: Math.max(mark.y1, mark.y2)
			};
		}

		function distToSegment(px, py, ax, ay, bx, by) {
			var dx = bx - ax;
			var dy = by - ay;
			var len2 = dx * dx + dy * dy;
			var u = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
			u = Math.max(0, Math.min(1, u));
			var cx = ax + u * dx;
			var cy = ay + u * dy;
			return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
		}

		function hitMark(mark, pt) {
			var d = displayRect();
			var px = pt.x * d.w;
			var py = pt.y * d.h;
			var tol = 8;
			if (mark.type === 'arrow') {
				return distToSegment(px, py, mark.x1 * d.w, mark.y1 * d.h, mark.x2 * d.w, mark.y2 * d.h) <= tol + (mark.size || 4);
			}
			if (mark.type === 'pen') {
				var pts = mark.points || [];
				if (pts.length === 1) {
					return Math.abs(px - pts[0].x * d.w) <= tol && Math.abs(py - pts[0].y * d.h) <= tol;
				}
				for (var i = 1; i < pts.length; i++) {
					if (distToSegment(px, py, pts[i - 1].x * d.w, pts[i - 1].y * d.h, pts[i].x * d.w, pts[i].y * d.h) <= tol + (mark.size || 4)) {
						return true;
					}
				}
				return false;
			}
			var bb = boundsOf(mark);
			var l = bb.l * d.w;
			var t = bb.t * d.h;
			var r = bb.r * d.w;
			var b = bb.b * d.h;
			if (mark.type === 'circle') {
				var rx = Math.max((r - l) / 2, 1);
				var ry = Math.max((b - t) / 2, 1);
				var e = Math.sqrt(Math.pow((px - (l + r) / 2) / rx, 2) + Math.pow((py - (t + b) / 2) / ry, 2));
				return Math.abs(e - 1) * Math.min(rx, ry) <= tol;
			}
			if (mark.type === 'rect') {
				var outer = px >= l - tol && px <= r + tol && py >= t - tol && py <= b + tol;
				var inner = px > l + tol && px < r - tol && py > t + tol && py < b - tol;
				return outer && !inner;
			}
			return px >= l - 3 && px <= r + 3 && py >= t - 3 && py <= b + 3;
		}

		function hitTest(pt) {
			for (var i = marks.length - 1; i >= 0; i--) {
				if (hitMark(marks[i], pt)) {
					return i;
				}
			}
			return -1;
		}

		/* Resize handles for the selected mark, in normalized coordinates. */
		function handlesOf(mark) {
			if (mark.type === 'arrow') {
				return [{ id: 'p1', x: mark.x1, y: mark.y1 }, { id: 'p2', x: mark.x2, y: mark.y2 }];
			}
			if (mark.type === 'circle' || mark.type === 'rect' || mark.type === 'highlight' || mark.type === 'blur') {
				var bb = boundsOf(mark);
				return [
					{ id: 'nw', x: bb.l, y: bb.t },
					{ id: 'ne', x: bb.r, y: bb.t },
					{ id: 'se', x: bb.r, y: bb.b },
					{ id: 'sw', x: bb.l, y: bb.b }
				];
			}
			return [];
		}

		function hitHandle(pt) {
			if (selected < 0 || !marks[selected]) {
				return null;
			}
			var d = displayRect();
			var list = handlesOf(marks[selected]);
			for (var i = 0; i < list.length; i++) {
				if (Math.abs(list[i].x * d.w - pt.x * d.w) <= HANDLE_PX && Math.abs(list[i].y * d.h - pt.y * d.h) <= HANDLE_PX) {
					return list[i].id;
				}
			}
			return null;
		}

		function invalidate() {
			baseDirty = true;
			scheduleRedraw();
		}

		function scheduleRedraw() {
			if (frame) {
				return;
			}
			frame = window.requestAnimationFrame(function () {
				frame = 0;
				redraw();
			});
		}

		function rebuildBase(skip) {
			if (base.width !== canvas.width || base.height !== canvas.height) {
				base.width = canvas.width;
				base.height = canvas.height;
			}
			var bctx = base.getContext('2d');
			if (!bctx) {
				return;
			}
			bctx.clearRect(0, 0, base.width, base.height);
			var unit = displayScale();
			marks.forEach(function (mark, index) {
				if (index !== skip) {
					drawMark(bctx, mark, base.width, base.height, unit, image);
				}
			});
			baseDirty = false;
			baseSkip = skip;
		}

		function drawSelection(ctx) {
			if (selected < 0 || !marks[selected] || editingText) {
				return;
			}
			var unit = displayScale();
			var bb = boundsOf(marks[selected]);
			var pad = 4 * unit;
			var x = bb.l * canvas.width - pad;
			var y = bb.t * canvas.height - pad;
			var w = (bb.r - bb.l) * canvas.width + pad * 2;
			var h = (bb.b - bb.t) * canvas.height + pad * 2;
			ctx.save();
			ctx.lineWidth = 1 * unit;
			if (marks[selected].type !== 'arrow') {
				ctx.strokeStyle = '#ffffff';
				ctx.strokeRect(x, y, w, h);
				ctx.setLineDash([5 * unit, 4 * unit]);
				ctx.strokeStyle = '#111827';
				ctx.strokeRect(x, y, w, h);
				ctx.setLineDash([]);
			}
			var hs = 8 * unit;
			handlesOf(marks[selected]).forEach(function (hd) {
				var hx = hd.x * canvas.width;
				var hy = hd.y * canvas.height;
				if (marks[selected].type !== 'arrow') {
					hx += (hd.id.indexOf('w') > -1 ? -pad : pad);
					hy += (hd.id.indexOf('n') > -1 ? -pad : pad);
				}
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#111827';
				ctx.lineWidth = 1.5 * unit;
				ctx.beginPath();
				ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs);
				ctx.fill();
				ctx.stroke();
			});
			ctx.restore();
		}

		function redraw() {
			var ctx = canvas.getContext('2d');
			if (!ctx) {
				return;
			}
			var skip = gesture ? gesture.idx : -1;
			if (baseDirty || baseSkip !== skip) {
				rebuildBase(skip);
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(base, 0, 0);
			var unit = displayScale();
			if (skip >= 0 && marks[skip]) {
				drawMark(ctx, marks[skip], canvas.width, canvas.height, unit, image);
			}
			if (drawing) {
				drawMark(ctx, drawing, canvas.width, canvas.height, unit, image);
			}
			drawSelection(ctx);
		}

		function resizeCanvas() {
			var rect = image.getBoundingClientRect();
			var ratio = window.devicePixelRatio || 1;
			var width = Math.max(1, Math.round(rect.width * ratio));
			var height = Math.max(1, Math.round(rect.height * ratio));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				baseDirty = true;
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

		function setToolInternal(next) {
			tool = next;
			if (next !== 'select') {
				selected = -1;
			}
			canvas.style.cursor = next === 'select' ? 'default' : '';
			if (typeof settings.onToolChange === 'function') {
				settings.onToolChange(next);
			}
		}

		function addMark(mark) {
			if (marks.length >= MAX_MARKS) {
				return false;
			}
			snapshot();
			marks.push(mark);
			var bctx = !baseDirty && baseSkip === -1 && base.width === canvas.width ? base.getContext('2d') : null;
			if (bctx) {
				// Paint just the new mark onto the cached layer instead of redrawing every mark.
				drawMark(bctx, mark, base.width, base.height, displayScale(), image);
				scheduleRedraw();
			} else {
				invalidate();
			}
			notify();
			return true;
		}

		function beginText(clientX, clientY, point, existingIndex) {
			var original = existingIndex > -1 ? marks[existingIndex] : null;
			var input = document.createElement('input');
			var done = false;
			var useColor = original ? original.color : color;
			var useSize = original ? original.size : size;
			var px = textSize({ size: useSize }, 1);
			editingText = true;
			if (original) {
				snapshot();
				marks.splice(existingIndex, 1);
				selected = -1;
				invalidate();
				input.value = original.text || '';
			}
			input.type = 'text';
			input.maxLength = 200;
			input.className = 'stillframe-text-input';
			input.setAttribute('aria-label', 'Annotation text');
			input.style.cssText = 'position:fixed;z-index:1000002;margin:0;padding:0 2px;min-width:80px;height:' + Math.round(px * 1.3) + 'px;' +
				'left:' + Math.round(clientX) + 'px;top:' + Math.round(clientY) + 'px;' +
				'font:700 ' + Math.round(px) + 'px -apple-system,"Segoe UI",Roboto,sans-serif;color:' + useColor + ';' +
				'background:rgba(255,255,255,.9);border:1px dashed ' + useColor + ';border-radius:2px;outline:none;box-shadow:none;user-select:text;-webkit-user-select:text;';
			function finish(commit) {
				if (done) {
					return;
				}
				done = true;
				editingText = false;
				var value = input.value.trim();
				if (input.parentNode) {
					input.parentNode.removeChild(input);
				}
				if (commit && value) {
					var mark = { type: 'text', text: value, color: useColor, size: useSize, x1: point.x, y1: point.y };
					if (marks.length < MAX_MARKS) {
						if (!original) {
							snapshot();
						}
						marks.push(mark);
						selected = marks.length - 1;
						setToolInternal('select');
					}
				} else if (original) {
					marks.splice(existingIndex, 0, original);
					history.pop();
				}
				invalidate();
				notify();
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
				input.select();
			}, 0);
		}

		function beginGesture(kind, idx, handle, point) {
			gesture = {
				kind: kind,
				idx: idx,
				handle: handle,
				start: point,
				before: JSON.stringify(marks),
				orig: copyMarks([marks[idx]])[0],
				moved: false
			};
			if (kind === 'resize' && marks[idx].x1 !== undefined && marks[idx].type !== 'arrow') {
				var o = marks[idx];
				var nx1 = Math.min(o.x1, o.x2);
				var nx2 = Math.max(o.x1, o.x2);
				var ny1 = Math.min(o.y1, o.y2);
				var ny2 = Math.max(o.y1, o.y2);
				o.x1 = nx1;
				o.x2 = nx2;
				o.y1 = ny1;
				o.y2 = ny2;
				gesture.orig = copyMarks([o])[0];
			}
			baseDirty = true;
		}

		function applyGesture(point) {
			var g = gesture;
			var o = g.orig;
			var m = marks[g.idx];
			var dx = point.x - g.start.x;
			var dy = point.y - g.start.y;
			if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
				g.moved = true;
			}
			if (g.kind === 'move') {
				var bb = boundsOf(o);
				dx = Math.max(-bb.l, Math.min(dx, 1 - bb.r));
				dy = Math.max(-bb.t, Math.min(dy, 1 - bb.b));
				if (o.type === 'pen') {
					m.points = o.points.map(function (pt) {
						return { x: pt.x + dx, y: pt.y + dy };
					});
				} else {
					m.x1 = o.x1 + dx;
					m.y1 = o.y1 + dy;
					if (o.x2 !== undefined) {
						m.x2 = o.x2 + dx;
						m.y2 = o.y2 + dy;
					}
				}
				return;
			}
			var cx = Math.min(1, Math.max(0, point.x));
			var cy = Math.min(1, Math.max(0, point.y));
			var h = g.handle;
			if (h === 'p1') {
				m.x1 = cx;
				m.y1 = cy;
			} else if (h === 'p2') {
				m.x2 = cx;
				m.y2 = cy;
			} else {
				if (h.indexOf('w') > -1) {
					m.x1 = Math.min(cx, o.x2 - 0.004);
				}
				if (h.indexOf('e') > -1) {
					m.x2 = Math.max(cx, o.x1 + 0.004);
				}
				if (h.indexOf('n') > -1) {
					m.y1 = Math.min(cy, o.y2 - 0.004);
				}
				if (h.indexOf('s') > -1) {
					m.y2 = Math.max(cy, o.y1 + 0.004);
				}
			}
		}

		function cursorFor(point) {
			if (tool !== 'select' || gesture) {
				return;
			}
			var h = hitHandle(point);
			if (h) {
				canvas.style.cursor = (h === 'nw' || h === 'se') ? 'nwse-resize' : ((h === 'ne' || h === 'sw') ? 'nesw-resize' : 'crosshair');
			} else {
				canvas.style.cursor = hitTest(point) > -1 ? 'move' : 'default';
			}
		}

		function onPointerDown(event) {
			if (event.button !== 0 || editingText) {
				return;
			}
			event.preventDefault();
			canvas.setPointerCapture(event.pointerId);
			var point = pointFromEvent(event);

			if (tool === 'select') {
				var handle = hitHandle(point);
				if (handle) {
					beginGesture('resize', selected, handle, point);
				} else {
					var idx = hitTest(point);
					selected = idx;
					if (idx > -1) {
						beginGesture('move', idx, null, point);
					}
				}
				scheduleRedraw();
				return;
			}

			if (tool === 'step') {
				canvas.releasePointerCapture(event.pointerId);
				var count = marks.filter(function (m) { return m.type === 'step'; }).length;
				addMark({ type: 'step', n: count + 1, color: color, size: size, x1: point.x, y1: point.y });
				return;
			}
			if (tool === 'text') {
				canvas.releasePointerCapture(event.pointerId);
				beginText(event.clientX, event.clientY, point, -1);
				return;
			}
			if (tool === 'pen') {
				drawing = { type: 'pen', color: color, size: size, points: [point] };
			} else {
				drawing = { type: tool, color: color, size: size, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
			}
			scheduleRedraw();
		}

		function onPointerMove(event) {
			var point = pointFromEvent(event);
			if (gesture) {
				event.preventDefault();
				applyGesture(point);
				scheduleRedraw();
				return;
			}
			if (!drawing) {
				cursorFor(point);
				return;
			}
			event.preventDefault();
			if (drawing.type === 'pen') {
				var last = drawing.points[drawing.points.length - 1];
				if (last && Math.abs(last.x - point.x) < 0.0008 && Math.abs(last.y - point.y) < 0.0008) {
					return;
				}
				if (drawing.points.length < MAX_PEN_POINTS) {
					drawing.points.push(point);
				}
			} else {
				point = constrain(point, event);
				drawing.x2 = point.x;
				drawing.y2 = point.y;
			}
			scheduleRedraw();
		}

		function onPointerUp(event) {
			if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
				canvas.releasePointerCapture(event.pointerId);
			}
			if (gesture) {
				if (gesture.moved) {
					history.push(gesture.before);
					if (history.length > 100) {
						history.shift();
					}
					notify();
				}
				gesture = null;
				invalidate();
				return;
			}
			if (!drawing) {
				return;
			}
			var finished = drawing;
			drawing = null;
			var keep = true;
			if ('x2' in finished) {
				var d = displayRect();
				keep = Math.abs(finished.x2 - finished.x1) * d.w >= 3 || Math.abs(finished.y2 - finished.y1) * d.h >= 3;
			}
			if (keep && addMark(finished) && finished.type === 'blur') {
				selected = marks.length - 1;
				setToolInternal('select');
			}
			scheduleRedraw();
		}

		function onPointerCancel() {
			if (gesture) {
				marks = JSON.parse(gesture.before);
				gesture = null;
				invalidate();
			}
			drawing = null;
			scheduleRedraw();
		}

		function onDoubleClick(event) {
			if (tool !== 'select') {
				return;
			}
			var point = pointFromEvent(event);
			var idx = hitTest(point);
			if (idx > -1 && marks[idx].type === 'text') {
				var d = displayRect();
				beginText(d.left + marks[idx].x1 * d.w, d.top + marks[idx].y1 * d.h, { x: marks[idx].x1, y: marks[idx].y1 }, idx);
			}
		}

		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerCancel);
		canvas.addEventListener('dblclick', onDoubleClick);

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
				if (TOOLS[next]) {
					setToolInternal(next);
					scheduleRedraw();
				}
			},
			setColor: function (next) {
				if (typeof next === 'string' && /^#[0-9a-f]{6}$/i.test(next)) {
					color = next;
					if (selected > -1 && marks[selected] && marks[selected].type !== 'blur') {
						snapshot();
						marks[selected].color = next;
						invalidate();
						notify();
					}
				}
			},
			setSize: function (next) {
				var value = parseFloat(next);
				if (value > 0 && value <= 16) {
					size = value;
					if (selected > -1 && marks[selected] && marks[selected].type !== 'blur' && marks[selected].type !== 'highlight') {
						snapshot();
						marks[selected].size = value;
						invalidate();
						notify();
					}
				}
			},
			undo: function () {
				if (!history.length) {
					return;
				}
				marks = JSON.parse(history.pop());
				selected = -1;
				drawing = null;
				invalidate();
				notify();
			},
			clear: function () {
				if (!marks.length) {
					return;
				}
				snapshot();
				marks = [];
				selected = -1;
				drawing = null;
				invalidate();
				notify();
			},
			deleteSelected: function () {
				if (selected < 0 || !marks[selected] || editingText) {
					return false;
				}
				snapshot();
				marks.splice(selected, 1);
				selected = -1;
				invalidate();
				notify();
				return true;
			},
			clearSelection: function () {
				if (selected < 0) {
					return false;
				}
				selected = -1;
				scheduleRedraw();
				return true;
			},
			hasMarks: function () {
				return marks.length > 0;
			},
			getMarks: function () {
				return copyMarks(marks);
			},
			setMarks: function (newMarks) {
				marks = Array.isArray(newMarks) ? copyMarks(newMarks) : [];
				history = [];
				selected = -1;
				drawing = null;
				invalidate();
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
				canvas.removeEventListener('dblclick', onDoubleClick);
				window.removeEventListener('resize', resizeCanvas);
				if (frame) {
					window.cancelAnimationFrame(frame);
					frame = 0;
				}
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				if (canvas.parentNode) {
					canvas.parentNode.removeChild(canvas);
				}
				marks = [];
				history = [];
				drawing = null;
				gesture = null;
			}
		};
	};
})();
