(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var defaultColor = '#ef4444';
	var defaultSize = 4;
	var FONT = '-apple-system, "Segoe UI", Roboto, sans-serif';
	var TOOLS = { select: 1, pen: 1, circle: 1, arrow: 1, rect: 1, highlight: 1, text: 1, step: 1, blur: 1 };
	var BOX_TYPES = { circle: 1, rect: 1, highlight: 1, blur: 1 };
	var NO_ROTATE = { arrow: 1, blur: 1, step: 1 };
	var UNIFORM = { text: 1, step: 1 };
	var MAX_MARKS = 400;
	var MAX_PEN_POINTS = 3000;
	var HANDLE_PX = 9;
	var ROTATE_OFFSET = 26;
	var measureCtx = null;

	/* ---- geometry helpers (all marks live in normalized 0..1 image space) ---- */

	function unitVector(x1, y1, x2, y2) {
		var dx = x2 - x1;
		var dy = y2 - y1;
		var length = Math.sqrt(dx * dx + dy * dy);
		if (!length) {
			return null;
		}
		return { x: dx / length, y: dy / length, length: length };
	}

	function copyMarks(list) {
		try {
			return JSON.parse(JSON.stringify(list));
		} catch (e) {
			return list.slice();
		}
	}

	function fontSize(mark) {
		return mark.fs || (12 + (mark.size || defaultSize) * 2.5);
	}

	function stepRadius(mark) {
		return mark.r || (9 + (mark.size || defaultSize) * 1.5);
	}

	function measureWidth(textValue, px) {
		if (!measureCtx) {
			measureCtx = document.createElement('canvas').getContext('2d');
		}
		measureCtx.font = '700 ' + Math.round(px) + 'px ' + FONT;
		return measureCtx.measureText(textValue).width;
	}

	/* Wrap text to the box width (display px). Returns lines plus overall size. */
	function textLayout(mark, displayWidth) {
		var px = fontSize(mark);
		var maxW = mark.w ? mark.w * displayWidth : 0;
		var lines = [];
		String(mark.text || '').split('\n').forEach(function (para) {
			if (!maxW) {
				lines.push(para);
				return;
			}
			var line = '';
			para.split(' ').forEach(function (word) {
				var test = line ? line + ' ' + word : word;
				if (line && measureWidth(test, px) > maxW) {
					lines.push(line);
					line = word;
				} else {
					line = test;
				}
			});
			lines.push(line);
		});
		var width = maxW;
		if (!maxW) {
			lines.forEach(function (line) {
				width = Math.max(width, measureWidth(line, px));
			});
		}
		return { lines: lines, px: px, lineHeight: px * 1.25, width: Math.max(width, 8), height: Math.max(lines.length, 1) * px * 1.25 };
	}

	/* Normalized, unrotated bounds. w/h are canvas size, unit is canvas px per display px. */
	function markBounds(mark, w, h, unit) {
		var dw = w / unit;
		var dh = h / unit;
		if (mark.type === 'pen') {
			var l = 1;
			var t = 1;
			var r = 0;
			var b = 0;
			(mark.points || []).forEach(function (pt) {
				l = Math.min(l, pt.x);
				t = Math.min(t, pt.y);
				r = Math.max(r, pt.x);
				b = Math.max(b, pt.y);
			});
			var pad = (mark.size || defaultSize) / 2;
			return { l: l - pad / dw, t: t - pad / dh, r: r + pad / dw, b: b + pad / dh };
		}
		if (mark.type === 'step') {
			var rad = stepRadius(mark);
			return { l: mark.x1 - rad / dw, t: mark.y1 - rad / dh, r: mark.x1 + rad / dw, b: mark.y1 + rad / dh };
		}
		if (mark.type === 'text') {
			var lay = textLayout(mark, dw);
			return { l: mark.x1, t: mark.y1, r: mark.x1 + lay.width / dw, b: mark.y1 + lay.height / dh };
		}
		return {
			l: Math.min(mark.x1, mark.x2),
			t: Math.min(mark.y1, mark.y2),
			r: Math.max(mark.x1, mark.x2),
			b: Math.max(mark.y1, mark.y2)
		};
	}

	function rotatePoint(x, y, cx, cy, angle) {
		var cos = Math.cos(angle);
		var sin = Math.sin(angle);
		return { x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos };
	}

	/* ---- drawing ---- */

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

	function drawBox(mark, width, height) {
		return {
			x: Math.min(mark.x1, mark.x2) * width,
			y: Math.min(mark.y1, mark.y2) * height,
			w: Math.abs(mark.x2 - mark.x1) * width,
			h: Math.abs(mark.y2 - mark.y1) * height
		};
	}

	function drawBlur(ctx, mark, width, height, unit, image) {
		var box = drawBox(mark, width, height);
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
		var radius = stepRadius(mark) * unit;
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
		ctx.font = '700 ' + Math.round(radius * 1.1) + 'px ' + FONT;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(mark.n || 1), cx, cy + radius * 0.05);
	}

	function drawText(ctx, mark, width, height, unit) {
		if (!mark.text) {
			return;
		}
		var lay = textLayout(mark, width / unit);
		ctx.font = '700 ' + Math.round(lay.px * unit) + 'px ' + FONT;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.lineWidth = Math.max(3, lay.px * unit / 5);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
		ctx.shadowColor = 'transparent';
		lay.lines.forEach(function (line, index) {
			var x = mark.x1 * width;
			var y = mark.y1 * height + index * lay.lineHeight * unit;
			ctx.strokeText(line, x, y);
			ctx.fillText(line, x, y);
		});
	}

	function drawMark(ctx, mark, width, height, unit, image) {
		var color = mark.color || defaultColor;
		var lineWidth = (mark.size || defaultSize) * unit;
		ctx.save();
		if (mark.rot && !NO_ROTATE[mark.type]) {
			var bb = markBounds(mark, width, height, unit);
			var rcx = (bb.l + bb.r) / 2 * width;
			var rcy = (bb.t + bb.b) / 2 * height;
			ctx.translate(rcx, rcy);
			ctx.rotate(mark.rot);
			ctx.translate(-rcx, -rcy);
		}
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
			var cb = drawBox(mark, width, height);
			if (cb.w >= 1 || cb.h >= 1) {
				ctx.beginPath();
				ctx.ellipse(cb.x + cb.w / 2, cb.y + cb.h / 2, Math.max(cb.w / 2, 0.5), Math.max(cb.h / 2, 0.5), 0, 0, Math.PI * 2);
				ctx.stroke();
			}
		} else if (mark.type === 'arrow') {
			drawArrow(ctx, mark.x1 * width, mark.y1 * height, mark.x2 * width, mark.y2 * height, lineWidth, unit);
		} else if (mark.type === 'rect') {
			var rb = drawBox(mark, width, height);
			if (rb.w >= 1 || rb.h >= 1) {
				ctx.lineJoin = 'miter';
				ctx.strokeRect(rb.x, rb.y, rb.w, rb.h);
			}
		} else if (mark.type === 'highlight') {
			var hb = drawBox(mark, width, height);
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

	/* ---- the editor ---- */

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var marks = [];
		var history = [];
		var selection = [];
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
		var baseSkipKey = '';
		var observer = null;

		canvas.className = 'stillframe-annotation-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		canvas.draggable = false;
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
			return rect.width ? canvas.width / rect.width : (window.devicePixelRatio || 1);
		}

		function pxBounds(mark) {
			var d = displayRect();
			var b = markBounds(mark, d.w, d.h, 1);
			return { l: b.l * d.w, t: b.t * d.h, r: b.r * d.w, b: b.b * d.h, cx: (b.l + b.r) / 2 * d.w, cy: (b.t + b.b) / 2 * d.h };
		}

		function canRotate(mark) {
			return !NO_ROTATE[mark.type];
		}

		function pointPx(pt) {
			var d = displayRect();
			return { x: pt.x * d.w, y: pt.y * d.h };
		}

		/* Pointer in the mark's own (unrotated) frame, in display px. */
		function toLocal(mark, ptPx) {
			var b = pxBounds(mark);
			return mark.rot && canRotate(mark) ? rotatePoint(ptPx.x, ptPx.y, b.cx, b.cy, -mark.rot) : ptPx;
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
			var lp = toLocal(mark, pointPx(pt));
			var px = lp.x;
			var py = lp.y;
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
			var b = pxBounds(mark);
			if (mark.type === 'circle') {
				var rx = Math.max((b.r - b.l) / 2, 1);
				var ry = Math.max((b.b - b.t) / 2, 1);
				var e = Math.sqrt(Math.pow((px - b.cx) / rx, 2) + Math.pow((py - b.cy) / ry, 2));
				return Math.abs(e - 1) * Math.min(rx, ry) <= tol;
			}
			if (mark.type === 'rect') {
				var outer = px >= b.l - tol && px <= b.r + tol && py >= b.t - tol && py <= b.b + tol;
				var inner = px > b.l + tol && px < b.r - tol && py > b.t + tol && py < b.b - tol;
				return outer && !inner;
			}
			return px >= b.l - 3 && px <= b.r + 3 && py >= b.t - 3 && py <= b.b + 3;
		}

		function hitTest(pt) {
			for (var i = marks.length - 1; i >= 0; i--) {
				if (hitMark(marks[i], pt)) {
					return i;
				}
			}
			return -1;
		}

		/* Handles for a lone selected mark, in the mark's local display-px frame. */
		function localHandles(mark) {
			if (mark.type === 'arrow') {
				var d = displayRect();
				return [{ id: 'p1', x: mark.x1 * d.w, y: mark.y1 * d.h, world: true }, { id: 'p2', x: mark.x2 * d.w, y: mark.y2 * d.h, world: true }];
			}
			var b = pxBounds(mark);
			var pad = 4;
			var list = [
				{ id: 'nw', x: b.l - pad, y: b.t - pad },
				{ id: 'ne', x: b.r + pad, y: b.t - pad },
				{ id: 'se', x: b.r + pad, y: b.b + pad },
				{ id: 'sw', x: b.l - pad, y: b.b + pad }
			];
			if (canRotate(mark)) {
				list.push({ id: 'rot', x: b.cx, y: b.t - pad - ROTATE_OFFSET });
			}
			return list;
		}

		function worldHandle(mark, hd) {
			if (hd.world) {
				return { x: hd.x, y: hd.y };
			}
			var b = pxBounds(mark);
			return mark.rot && canRotate(mark) ? rotatePoint(hd.x, hd.y, b.cx, b.cy, mark.rot) : { x: hd.x, y: hd.y };
		}

		function hitHandle(pt) {
			if (selection.length !== 1 || !marks[selection[0]]) {
				return null;
			}
			var mark = marks[selection[0]];
			var p = pointPx(pt);
			var list = localHandles(mark);
			for (var i = 0; i < list.length; i++) {
				var w = worldHandle(mark, list[i]);
				if (Math.abs(w.x - p.x) <= HANDLE_PX && Math.abs(w.y - p.y) <= HANDLE_PX) {
					return list[i].id;
				}
			}
			return null;
		}

		/* ---- rendering ---- */

		function scheduleRedraw() {
			if (frame) {
				return;
			}
			frame = window.requestAnimationFrame(function () {
				frame = 0;
				redraw();
			});
		}

		function invalidate() {
			baseDirty = true;
			scheduleRedraw();
		}

		function skipSet() {
			var set = {};
			if (gesture && gesture.indices) {
				gesture.indices.forEach(function (i) {
					set[i] = true;
				});
			}
			return set;
		}

		function rebuildBase(skip, key) {
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
				if (!skip[index]) {
					drawMark(bctx, mark, base.width, base.height, unit, image);
				}
			});
			baseDirty = false;
			baseSkipKey = key;
		}

		function drawSelection(ctx) {
			if (!selection.length || editingText) {
				return;
			}
			var unit = displayScale();
			var single = selection.length === 1;
			selection.forEach(function (index) {
				var mark = marks[index];
				if (!mark) {
					return;
				}
				var b = pxBounds(mark);
				var pad = 4;
				ctx.save();
				ctx.scale(unit, unit);
				if (mark.rot && canRotate(mark)) {
					ctx.translate(b.cx, b.cy);
					ctx.rotate(mark.rot);
					ctx.translate(-b.cx, -b.cy);
				}
				if (mark.type !== 'arrow') {
					ctx.lineWidth = 1;
					ctx.strokeStyle = '#ffffff';
					ctx.strokeRect(b.l - pad, b.t - pad, b.r - b.l + pad * 2, b.b - b.t + pad * 2);
					ctx.setLineDash([5, 4]);
					ctx.strokeStyle = '#374151';
					ctx.strokeRect(b.l - pad, b.t - pad, b.r - b.l + pad * 2, b.b - b.t + pad * 2);
					ctx.setLineDash([]);
				}
				if (single) {
					ctx.lineWidth = 1.5;
					localHandles(mark).forEach(function (hd) {
						if (hd.world && mark.rot) {
							return;
						}
						ctx.fillStyle = '#ffffff';
						ctx.strokeStyle = '#374151';
						ctx.beginPath();
						if (hd.id === 'rot') {
							ctx.moveTo(b.cx, b.t - pad);
							ctx.lineTo(hd.x, hd.y);
							ctx.stroke();
							ctx.beginPath();
							ctx.arc(hd.x, hd.y, 5, 0, Math.PI * 2);
						} else {
							ctx.rect(hd.x - 4, hd.y - 4, 8, 8);
						}
						ctx.fill();
						ctx.stroke();
					});
				}
				ctx.restore();
			});
		}

		function drawMarquee(ctx) {
			if (!gesture || gesture.kind !== 'marquee' || !gesture.moved) {
				return;
			}
			var x = Math.min(gesture.start.x, gesture.cur.x) * canvas.width;
			var y = Math.min(gesture.start.y, gesture.cur.y) * canvas.height;
			var w = Math.abs(gesture.cur.x - gesture.start.x) * canvas.width;
			var h = Math.abs(gesture.cur.y - gesture.start.y) * canvas.height;
			var unit = displayScale();
			ctx.save();
			ctx.fillStyle = 'rgba(55, 65, 81, 0.10)';
			ctx.fillRect(x, y, w, h);
			ctx.lineWidth = unit;
			ctx.setLineDash([4 * unit, 3 * unit]);
			ctx.strokeStyle = '#374151';
			ctx.strokeRect(x, y, w, h);
			ctx.restore();
		}

		function drawTextBoxPreview(ctx) {
			if (!drawing || drawing.type !== 'textbox') {
				return;
			}
			var unit = displayScale();
			ctx.save();
			ctx.lineWidth = unit;
			ctx.setLineDash([4 * unit, 3 * unit]);
			ctx.strokeStyle = color;
			ctx.strokeRect(
				Math.min(drawing.x1, drawing.x2) * canvas.width,
				Math.min(drawing.y1, drawing.y2) * canvas.height,
				Math.abs(drawing.x2 - drawing.x1) * canvas.width,
				Math.abs(drawing.y2 - drawing.y1) * canvas.height
			);
			ctx.restore();
		}

		function redraw() {
			var ctx = canvas.getContext('2d');
			if (!ctx) {
				return;
			}
			var skip = skipSet();
			var key = Object.keys(skip).join(',');
			if (baseDirty || baseSkipKey !== key) {
				rebuildBase(skip, key);
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(base, 0, 0);
			var unit = displayScale();
			Object.keys(skip).forEach(function (i) {
				if (marks[i]) {
					drawMark(ctx, marks[i], canvas.width, canvas.height, unit, image);
				}
			});
			if (drawing && drawing.type !== 'textbox') {
				drawMark(ctx, drawing, canvas.width, canvas.height, unit, image);
			}
			drawTextBoxPreview(ctx);
			drawSelection(ctx);
			drawMarquee(ctx);
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
			} else if (drawing.type === 'arrow') {
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
				selection = [];
			}
			canvas.style.cursor = next === 'select' ? 'default' : '';
			if (typeof settings.onToolChange === 'function') {
				settings.onToolChange(next);
			}
		}

		/* Add a mark, select it, and hand over to the Select tool so it can be adjusted. */
		function addMark(mark) {
			if (marks.length >= MAX_MARKS) {
				return false;
			}
			snapshot();
			marks.push(mark);
			if (mark.type !== 'pen') {
				selection = [marks.length - 1];
				setToolInternal('select');
			}
			invalidate();
			notify();
			return true;
		}

		/* ---- text ---- */

		function beginText(clientX, clientY, point, boxWidth, existingIndex) {
			var original = existingIndex > -1 ? marks[existingIndex] : null;
			var input = document.createElement('textarea');
			var done = false;
			var useColor = original ? original.color : color;
			var useSize = original ? original.size : size;
			var px = original ? fontSize(original) : fontSize({ size: useSize });
			var useWidth = original ? original.w : boxWidth;
			var d = displayRect();
			editingText = true;
			if (original) {
				snapshot();
				marks.splice(existingIndex, 1);
				selection = [];
				invalidate();
				input.value = original.text || '';
			}
			input.rows = 1;
			input.maxLength = 400;
			input.className = 'stillframe-text-input';
			input.setAttribute('aria-label', 'Annotation text');
			input.style.cssText = 'position:fixed;z-index:1000002;margin:0;padding:0 2px;resize:none;overflow:hidden;line-height:1.25;' +
				'width:' + (useWidth ? Math.round(useWidth * d.w) + 'px' : '140px') + ';height:' + Math.round(px * 1.35) + 'px;' +
				'left:' + Math.round(clientX) + 'px;top:' + Math.round(clientY) + 'px;' +
				'font:700 ' + Math.round(px) + 'px/1.25 ' + FONT + ';color:' + useColor + ';' +
				'background:rgba(255,255,255,.9);border:1px dashed ' + useColor + ';border-radius:2px;outline:none;box-shadow:none;user-select:text;-webkit-user-select:text;';
			function fit() {
				input.style.height = 'auto';
				input.style.height = Math.max(Math.round(px * 1.35), input.scrollHeight) + 'px';
			}
			function finish(commit) {
				if (done) {
					return;
				}
				done = true;
				editingText = false;
				var value = input.value.replace(/\s+$/, '');
				if (input.parentNode) {
					input.parentNode.removeChild(input);
				}
				if (commit && value.trim() && marks.length < MAX_MARKS) {
					if (!original) {
						snapshot();
					}
					var mark = { type: 'text', text: value, color: useColor, size: useSize, x1: point.x, y1: point.y };
					if (useWidth) {
						mark.w = useWidth;
					}
					if (original && original.fs) {
						mark.fs = original.fs;
					}
					if (original && original.rot) {
						mark.rot = original.rot;
					}
					marks.push(mark);
					selection = [marks.length - 1];
					setToolInternal('select');
				} else if (original) {
					marks.splice(existingIndex, 0, original);
					history.pop();
				}
				invalidate();
				notify();
			}
			input.addEventListener('input', fit);
			input.addEventListener('keydown', function (e) {
				e.stopPropagation();
				if (e.key === 'Enter' && !e.shiftKey) {
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
			input.focus();
			if (original) {
				input.select();
			}
			fit();
		}

		/* ---- gestures: move, resize, rotate, marquee ---- */

		function beginGesture(kind, indices, handle, point) {
			var mark = marks[indices[0]];
			gesture = {
				kind: kind,
				indices: kind === 'marquee' ? null : indices,
				handle: handle,
				start: point,
				cur: point,
				before: JSON.stringify(marks),
				origs: {},
				moved: false,
				baseSel: selection.slice()
			};
			if (kind === 'marquee') {
				return;
			}
			if (kind === 'resize' && BOX_TYPES[mark.type]) {
				var nx1 = Math.min(mark.x1, mark.x2);
				var nx2 = Math.max(mark.x1, mark.x2);
				var ny1 = Math.min(mark.y1, mark.y2);
				var ny2 = Math.max(mark.y1, mark.y2);
				mark.x1 = nx1;
				mark.x2 = nx2;
				mark.y1 = ny1;
				mark.y2 = ny2;
			}
			indices.forEach(function (i) {
				gesture.origs[i] = copyMarks([marks[i]])[0];
			});
			if (kind !== 'move') {
				gesture.box = pxBounds(gesture.origs[indices[0]]);
				gesture.startAngle = Math.atan2(pointPx(point).y - gesture.box.cy, pointPx(point).x - gesture.box.cx);
			}
			baseDirty = true;
		}

		function moveMarks(g, point) {
			var dx = point.x - g.start.x;
			var dy = point.y - g.start.y;
			var d = displayRect();
			var minL = 0;
			var minT = 0;
			var maxR = 1;
			var maxB = 1;
			var first = true;
			g.indices.forEach(function (i) {
				var b = markBounds(g.origs[i], d.w, d.h, 1);
				if (first) {
					minL = b.l;
					minT = b.t;
					maxR = b.r;
					maxB = b.b;
					first = false;
				} else {
					minL = Math.min(minL, b.l);
					minT = Math.min(minT, b.t);
					maxR = Math.max(maxR, b.r);
					maxB = Math.max(maxB, b.b);
				}
			});
			dx = Math.max(-minL, Math.min(dx, 1 - maxR));
			dy = Math.max(-minT, Math.min(dy, 1 - maxB));
			g.indices.forEach(function (i) {
				var o = g.origs[i];
				var m = marks[i];
				if (o.type === 'pen') {
					m.points = o.points.map(function (pt) {
						return { x: pt.x + dx, y: pt.y + dy };
					});
					return;
				}
				m.x1 = o.x1 + dx;
				m.y1 = o.y1 + dy;
				if (o.x2 !== undefined) {
					m.x2 = o.x2 + dx;
					m.y2 = o.y2 + dy;
				}
			});
		}

		function rotateMark(g, point, event) {
			var m = marks[g.indices[0]];
			var o = g.origs[g.indices[0]];
			var p = pointPx(point);
			var angle = Math.atan2(p.y - g.box.cy, p.x - g.box.cx) - g.startAngle + (o.rot || 0);
			var snapStep = Math.PI / 12;
			var snapped = Math.round(angle / snapStep) * snapStep;
			if (event.shiftKey || Math.abs(angle - snapped) < 0.06) {
				angle = snapped;
			}
			m.rot = angle;
		}

		function resizeMark(g, point) {
			var d = displayRect();
			var idx = g.indices[0];
			var o = g.origs[idx];
			var m = marks[idx];
			var h = g.handle;
			var p = pointPx(point);
			if (h === 'p1' || h === 'p2') {
				var ex = Math.min(1, Math.max(0, point.x));
				var ey = Math.min(1, Math.max(0, point.y));
				if (h === 'p1') {
					m.x1 = ex;
					m.y1 = ey;
				} else {
					m.x2 = ex;
					m.y2 = ey;
				}
				return;
			}
			var b = g.box;
			var local = o.rot && canRotate(o) ? rotatePoint(p.x, p.y, b.cx, b.cy, -o.rot) : p;
			var ow = b.r - b.l;
			var oh = b.b - b.t;
			var nl = b.l;
			var nr = b.r;
			var nt = b.t;
			var nb = b.b;
			var min = 8;
			if (UNIFORM[o.type]) {
				var rawW = h.indexOf('w') > -1 ? b.r - local.x : local.x - b.l;
				var rawH = h.indexOf('n') > -1 ? b.b - local.y : local.y - b.t;
				var s = Math.max(rawW / ow, rawH / oh, min / Math.min(ow, oh));
				if (h.indexOf('w') > -1) {
					nl = b.r - ow * s;
				} else {
					nr = b.l + ow * s;
				}
				if (h.indexOf('n') > -1) {
					nt = b.b - oh * s;
				} else {
					nb = b.t + oh * s;
				}
				var cxLocal = (nl + nr) / 2;
				var cyLocal = (nt + nb) / 2;
				var cw = o.rot && canRotate(o) ? rotatePoint(cxLocal, cyLocal, b.cx, b.cy, o.rot) : { x: cxLocal, y: cyLocal };
				if (o.type === 'step') {
					m.r = Math.max(6, stepRadius(o) * s);
					m.x1 = cw.x / d.w;
					m.y1 = cw.y / d.h;
				} else {
					m.fs = Math.max(8, Math.min(240, fontSize(o) * s));
					if (o.w) {
						m.w = Math.min(1, o.w * s);
					}
					var lay = textLayout(m, d.w);
					m.x1 = (cw.x - lay.width / 2) / d.w;
					m.y1 = (cw.y - lay.height / 2) / d.h;
				}
				return;
			}
			if (h.indexOf('w') > -1) {
				nl = Math.min(local.x, b.r - min);
			}
			if (h.indexOf('e') > -1) {
				nr = Math.max(local.x, b.l + min);
			}
			if (h.indexOf('n') > -1) {
				nt = Math.min(local.y, b.b - min);
			}
			if (h.indexOf('s') > -1) {
				nb = Math.max(local.y, b.t + min);
			}
			var lc = { x: (nl + nr) / 2, y: (nt + nb) / 2 };
			var wc = o.rot && canRotate(o) ? rotatePoint(lc.x, lc.y, b.cx, b.cy, o.rot) : lc;
			var nw = nr - nl;
			var nh = nb - nt;
			if (o.type === 'pen') {
				m.points = o.points.map(function (pt) {
					return {
						x: (wc.x - nw / 2 + ((pt.x * d.w - b.l) / ow) * nw) / d.w,
						y: (wc.y - nh / 2 + ((pt.y * d.h - b.t) / oh) * nh) / d.h
					};
				});
				return;
			}
			m.x1 = (wc.x - nw / 2) / d.w;
			m.x2 = (wc.x + nw / 2) / d.w;
			m.y1 = (wc.y - nh / 2) / d.h;
			m.y2 = (wc.y + nh / 2) / d.h;
		}

		function marqueeSelect(g) {
			var d = displayRect();
			var l = Math.min(g.start.x, g.cur.x);
			var r = Math.max(g.start.x, g.cur.x);
			var t = Math.min(g.start.y, g.cur.y);
			var b = Math.max(g.start.y, g.cur.y);
			var found = [];
			marks.forEach(function (mark, i) {
				var mb = markBounds(mark, d.w, d.h, 1);
				if (mb.r >= l && mb.l <= r && mb.b >= t && mb.t <= b) {
					found.push(i);
				}
			});
			var merged = g.shift ? g.baseSel.slice() : [];
			found.forEach(function (i) {
				if (merged.indexOf(i) < 0) {
					merged.push(i);
				}
			});
			selection = merged;
		}

		function cursorFor(point) {
			if (tool !== 'select' || gesture) {
				return;
			}
			var h = hitHandle(point);
			if (h === 'rot') {
				canvas.style.cursor = 'grab';
			} else if (h) {
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
					beginGesture(handle === 'rot' ? 'rotate' : 'resize', selection.slice(), handle, point);
					scheduleRedraw();
					return;
				}
				var idx = hitTest(point);
				if (idx > -1) {
					var at = selection.indexOf(idx);
					if (event.shiftKey) {
						if (at > -1) {
							selection.splice(at, 1);
							scheduleRedraw();
							return;
						}
						selection.push(idx);
					} else if (at < 0) {
						selection = [idx];
					}
					beginGesture('move', selection.slice(), null, point);
				} else {
					if (!event.shiftKey) {
						selection = [];
					}
					beginGesture('marquee', [], null, point);
					gesture.shift = event.shiftKey;
				}
				scheduleRedraw();
				return;
			}

			selection = [];
			if (tool === 'step') {
				canvas.releasePointerCapture(event.pointerId);
				var count = marks.filter(function (m) { return m.type === 'step'; }).length;
				addMark({ type: 'step', n: count + 1, color: color, size: size, x1: point.x, y1: point.y });
				return;
			}
			if (tool === 'text') {
				drawing = { type: 'textbox', x1: point.x, y1: point.y, x2: point.x, y2: point.y };
			} else if (tool === 'pen') {
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
				var g = gesture;
				g.cur = point;
				if (Math.abs(point.x - g.start.x) + Math.abs(point.y - g.start.y) > 0.002) {
					g.moved = true;
				}
				if (g.moved) {
					if (g.kind === 'move') {
						moveMarks(g, point);
					} else if (g.kind === 'rotate') {
						rotateMark(g, point, event);
					} else if (g.kind === 'resize') {
						resizeMark(g, point);
					} else {
						marqueeSelect(g);
					}
				}
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
				var done = gesture;
				gesture = null;
				if (done.moved && done.kind !== 'marquee') {
					history.push(done.before);
					if (history.length > 100) {
						history.shift();
					}
					notify();
				}
				invalidate();
				return;
			}
			if (!drawing) {
				return;
			}
			var finished = drawing;
			drawing = null;
			var d = displayRect();
			if (finished.type === 'textbox') {
				var dragged = Math.abs(finished.x2 - finished.x1) * d.w >= 24 && Math.abs(finished.y2 - finished.y1) * d.h >= 12;
				var tx = dragged ? Math.min(finished.x1, finished.x2) : finished.x1;
				var ty = dragged ? Math.min(finished.y1, finished.y2) : finished.y1;
				beginText(d.left + tx * d.w, d.top + ty * d.h, { x: tx, y: ty }, dragged ? Math.abs(finished.x2 - finished.x1) : 0, -1);
				scheduleRedraw();
				return;
			}
			var keep = true;
			if ('x2' in finished) {
				keep = Math.abs(finished.x2 - finished.x1) * d.w >= 3 || Math.abs(finished.y2 - finished.y1) * d.h >= 3;
			}
			if (keep) {
				addMark(finished);
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
			var idx = hitTest(pointFromEvent(event));
			if (idx > -1 && marks[idx].type === 'text') {
				var d = displayRect();
				beginText(d.left + marks[idx].x1 * d.w, d.top + marks[idx].y1 * d.h, { x: marks[idx].x1, y: marks[idx].y1 }, 0, idx);
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

		function applyToSelection(fn) {
			var changed = false;
			selection.forEach(function (i) {
				if (marks[i] && fn(marks[i])) {
					changed = true;
				}
			});
			return changed;
		}

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
					if (selection.length) {
						snapshot();
						if (applyToSelection(function (m) {
							if (m.type === 'blur') {
								return false;
							}
							m.color = next;
							return true;
						})) {
							invalidate();
							notify();
						} else {
							history.pop();
						}
					}
				}
			},
			setSize: function (next) {
				var value = parseFloat(next);
				if (value > 0 && value <= 16) {
					size = value;
					if (selection.length) {
						snapshot();
						if (applyToSelection(function (m) {
							if (m.type === 'blur' || m.type === 'highlight') {
								return false;
							}
							m.size = value;
							if (m.type === 'step') {
								m.r = 9 + value * 1.5;
							} else if (m.type === 'text') {
								m.fs = 12 + value * 2.5;
							}
							return true;
						})) {
							invalidate();
							notify();
						} else {
							history.pop();
						}
					}
				}
			},
			undo: function () {
				if (!history.length) {
					return;
				}
				marks = JSON.parse(history.pop());
				selection = [];
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
				selection = [];
				drawing = null;
				invalidate();
				notify();
			},
			selectAll: function () {
				if (!marks.length || editingText) {
					return false;
				}
				setToolInternal('select');
				selection = marks.map(function (m, i) { return i; });
				scheduleRedraw();
				return true;
			},
			deleteSelected: function () {
				if (!selection.length || editingText) {
					return false;
				}
				snapshot();
				var drop = selection.slice().sort(function (a, b) { return b - a; });
				drop.forEach(function (i) {
					marks.splice(i, 1);
				});
				selection = [];
				invalidate();
				notify();
				return true;
			},
			clearSelection: function () {
				if (!selection.length) {
					return false;
				}
				selection = [];
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
				selection = [];
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
