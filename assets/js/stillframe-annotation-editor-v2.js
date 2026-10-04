/**
 * Stillframe annotation editor, built on Fabric.js (vendor/fabric.min.js, MIT).
 *
 * Same public API as stillframe-annotation-editor.js:
 * createAnnotationEditor(wrap, image, options) and flattenImageAndMarks(image, marks).
 * Marks live in image pixels, so exports are lossless at any zoom.
 */
(function () {
	'use strict';

	var api = window.StillframeCapture || {};
	window.StillframeCapture = api;

	var fabric = window.fabric;
	if (!fabric) {
		return;
	}

	var FONT = 'Arial, Helvetica, sans-serif';
	var DEFAULT_COLOR = '#ef4444';
	var DEFAULT_SIZE = 4;
	var TOOLS = { select: 1, pen: 1, circle: 1, arrow: 1, rect: 1, highlight: 1, text: 1, step: 1, blur: 1, pixelate: 1 };
	var PROPS = ['sfType', 'sfMode', 'sfLevel', 'sfColor', 'sfSize', 'sfNumColor', 'sfFilled', 'sfDashed'];
	var FONTS = {
		sans: 'Arial, Helvetica, sans-serif',
		serif: 'Georgia, "Times New Roman", serif',
		rounded: '"Trebuchet MS", Verdana, sans-serif',
		mono: '"Courier New", Consolas, monospace',
		impact: 'Impact, "Arial Black", sans-serif'
	};
	var HISTORY_LIMIT = 100;
	var BRAND = '#005976';
	// Marks stay inside the working area with this many screen pixels to spare, so every handle stays visible and grabbable.
	var VIEW_PAD = 10;
	var SNAP_KEYS = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'width', 'fontSize', 'strokeWidth'];

	// Image the blur marks sample from. Set by the editor, and briefly by flatten().
	var blurSource = null;

	/* ---- shared helpers ---- */

	function isColor(value) {
		return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function hexToRgba(hex, alpha) {
		var n = parseInt(hex.slice(1), 16);
		return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + alpha + ')';
	}

	function dashFor(obj) {
		var w = obj.strokeWidth || 2;
		return obj.sfDashed ? [w * 2.6, w * 2] : null;
	}

	// Black or white, whichever reads better on top of the given colour.
	function contrastOn(hex) {
		var n = parseInt(hex.slice(1), 16);
		var lum = 0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255);
		return lum > 160 ? '#111827' : '#ffffff';
	}

	// The white halo that keeps text readable: thin, and it stops growing once the letters are big.
	function textOutline(size) {
		return clamp(size / 9, 2, 6);
	}

	// Text stretches freely while it is dragged: corners scale it evenly, the side handles only its width,
	// the top and bottom handles only its height. When the drag ends the stretch is folded into the font size,
	// so the Size control always shows the real letter height and only the width ratio stays as a stretch.
	function bakeTextScale(t) {
		if (!t || t.sfType !== 'text') {
			return;
		}
		var ky = t.scaleY;
		var kx = t.scaleX;
		if (!(ky > 0) || !(kx > 0) || (ky === 1 && kx === 1)) {
			return;
		}
		var size = clamp(t.fontSize * ky, 6, 1200);
		var k = size / t.fontSize;
		t.set({ fontSize: size, width: t.width * k, strokeWidth: textOutline(size), scaleX: kx / ky, scaleY: 1 });
		t.initDimensions();
		t.setCoords();
	}

	// Own copy of the controls: the rotate knob sits close to the box, and text gets stretch handles on every side.
	function tuneControls(obj) {
		if (obj.sfTuned || !obj.controls) {
			return;
		}
		obj.sfTuned = true;
		var own = Object.assign({}, obj.controls);
		if (own.mtr) {
			var rotate = Object.create(own.mtr);
			rotate.offsetY = -20;
			own.mtr = rotate;
		}
		if (obj.sfType === 'text') {
			// A text box's side handles would only re-wrap it; make them stretch the letters sideways instead.
			[['ml', fabric.controlsUtils.scalingX], ['mr', fabric.controlsUtils.scalingX], ['mt', fabric.controlsUtils.scalingY], ['mb', fabric.controlsUtils.scalingY]].forEach(function (pair) {
				if (own[pair[0]] && pair[1]) {
					var control = Object.create(own[pair[0]]);
					control.actionHandler = pair[1];
					own[pair[0]] = control;
				}
			});
		}
		obj.controls = own;
	}

	function styleControls(obj) {
		obj.set({
			cornerStyle: 'circle',
			cornerColor: '#ffffff',
			cornerStrokeColor: BRAND,
			cornerSize: 8,
			touchCornerSize: 24,
			lockScalingFlip: true,
			borderDashArray: null,
			transparentCorners: false,
			borderColor: BRAND,
			borderScaleFactor: 1,
			padding: 3,
			strokeUniform: true
		});
		tuneControls(obj);
		return obj;
	}

	/* Blur and pixelate: a rectangle that paints a processed copy of the image beneath it. */
	function blurRender(ctx) {
		var src = blurSource;
		var w = this.width;
		var h = this.height;
		var sw = Math.abs(w * this.scaleX);
		var sh = Math.abs(h * this.scaleY);
		if (!src || sw < 2 || sh < 2) {
			return;
		}
		var level = this.sfLevel || 12;
		var x = this.left;
		var y = this.top;
		var useBlur = this.sfMode !== 'pixelate' && typeof ctx.filter === 'string';
		if (useBlur) {
			var pad = Math.ceil(level * 2);
			var big = document.createElement('canvas');
			big.width = Math.max(1, Math.round(sw + pad * 2));
			big.height = Math.max(1, Math.round(sh + pad * 2));
			var bctx = big.getContext('2d');
			bctx.filter = 'blur(' + level + 'px)';
			bctx.drawImage(src, x - pad, y - pad, sw + pad * 2, sh + pad * 2, 0, 0, big.width, big.height);
			ctx.drawImage(big, pad, pad, sw, sh, -w / 2, -h / 2, w, h);
			return;
		}
		var block = Math.max(4, level * 1.2);
		var tw = Math.max(1, Math.round(sw / block));
		var th = Math.max(1, Math.round(sh / block));
		var tmp = document.createElement('canvas');
		tmp.width = tw;
		tmp.height = th;
		tmp.getContext('2d').drawImage(src, x, y, sw, sh, 0, 0, tw, th);
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tmp, 0, 0, tw, th, -w / 2, -h / 2, w, h);
	}

	/* ---- object factories ---- */

	function makeArrow(x1, y1, x2, y2, color, sw) {
		var dx = x2 - x1;
		var dy = y2 - y1;
		var length = Math.sqrt(dx * dx + dy * dy);
		if (length < 1) {
			return null;
		}
		var ux = dx / length;
		var uy = dy / length;
		var head = Math.min(length * 0.7, Math.max(sw * 4.6, 16));
		var bx = x2 - ux * head;
		var by = y2 - uy * head;
		var line = new fabric.Line([x1, y1, bx + ux * head * 0.25, by + uy * head * 0.25], {
			stroke: color,
			strokeWidth: sw,
			strokeLineCap: 'round',
			selectable: false
		});
		var tri = new fabric.Triangle({
			width: head * 0.84,
			height: head,
			fill: color,
			originX: 'center',
			originY: 'center',
			left: x2 - ux * head / 2,
			top: y2 - uy * head / 2,
			angle: Math.atan2(dy, dx) * 180 / Math.PI + 90,
			selectable: false
		});
		var group = new fabric.Group([line, tri], { sfType: 'arrow', sfColor: color, sfSize: sw, lockUniScaling: true });
		return styleControls(group);
	}

	function makeStep(x, y, n, color, radius, unit, font, numColor) {
		var circle = new fabric.Circle({
			radius: radius,
			fill: color,
			stroke: '#ffffff',
			strokeWidth: 2.5 * unit,
			originX: 'center',
			originY: 'center'
		});
		var label = new fabric.FabricText(String(n), {
			fontFamily: font || FONT,
			fontWeight: '700',
			fontSize: Math.round(radius * 1.1),
			fill: numColor || contrastOn(color),
			originX: 'center',
			originY: 'center'
		});
		var group = new fabric.Group([circle, label], {
			left: x,
			top: y,
			originX: 'center',
			originY: 'center',
			sfType: 'step',
			sfColor: color,
			sfNumColor: numColor || '',
			lockUniScaling: true,
			shadow: new fabric.Shadow({ color: 'rgba(15,23,42,0.35)', blur: 6 * unit, offsetX: 0, offsetY: 2 * unit })
		});
		group.setControlsVisibility({ mtr: false });
		return styleControls(group);
	}

	var measureCtx = document.createElement('canvas').getContext('2d');

	/* A new text box hugs what is typed until the user drags a side handle to set a width. */
	function fitTextWidth(t) {
		if (t.sfManual || !measureCtx) {
			return;
		}
		measureCtx.font = (t.fontWeight || '700') + ' ' + t.fontSize + 'px ' + (t.fontFamily || FONT);
		var w = 0;
		String(t.text || '').split('\n').forEach(function (line) {
			w = Math.max(w, measureCtx.measureText(line || ' ').width);
		});
		t.set('width', Math.ceil(w + t.fontSize * 0.4));
		t.initDimensions();
		t.setCoords();
	}

	function makeText(x, y, color, fontSize, font) {
		var text = new fabric.Textbox('Text', {
			left: x,
			top: y,
			width: fontSize * 3,
			splitByGrapheme: false,
			fontFamily: font || FONT,
			fontWeight: '700',
			fontSize: fontSize,
			fill: color,
			sfColor: color,
			stroke: 'rgba(255,255,255,0.95)',
			strokeWidth: textOutline(fontSize),
			paintFirst: 'stroke',
			sfType: 'text'
		});
		fitTextWidth(text);
		return styleControls(text);
	}

	/* Re-attach behaviour that does not survive serialization. */
	function decorate(obj) {
		styleControls(obj);
		if (obj.sfType === 'blur') {
			obj._render = blurRender;
			obj.set({ lockRotation: true, objectCaching: false });
			obj.setControlsVisibility({ mtr: false });
		} else if (obj.sfType === 'highlight') {
			obj.set({ globalCompositeOperation: 'multiply' });
		} else if (obj.sfType === 'step') {
			obj.setControlsVisibility({ mtr: false });
		}
		return obj;
	}

	function validMarks(list) {
		return (Array.isArray(list) ? list : []).filter(function (item) {
			return item && typeof item === 'object' && typeof item.sfType === 'string' && typeof item.type === 'string';
		});
	}

	function enliven(list) {
		var valid = validMarks(list);
		if (!valid.length) {
			return Promise.resolve([]);
		}
		return fabric.util.enlivenObjects(JSON.parse(JSON.stringify(valid))).then(function (objects) {
			return objects.map(decorate);
		});
	}

	/* ---- export ---- */

	api.flattenImageAndMarks = function (image, marksList) {
		return new Promise(function (resolve, reject) {
			if (!image || !image.naturalWidth || !image.naturalHeight) {
				reject(new Error('image'));
				return;
			}
			var nw = image.naturalWidth;
			var nh = image.naturalHeight;
			var sc = new fabric.StaticCanvas(undefined, {
				width: nw,
				height: nh,
				enableRetinaScaling: false,
				renderOnAddRemove: false
			});
			enliven(marksList).then(function (objects) {
				var previous = blurSource;
				blurSource = image;
				try {
					// The export is exactly the picture: anything dragged past its edge is simply left out.
					sc.backgroundImage = new fabric.FabricImage(image);
					objects.forEach(function (obj) {
						sc.add(obj);
					});
					sc.renderAll();
				} finally {
					blurSource = previous;
				}
				sc.getElement().toBlob(function (blob) {
					sc.dispose();
					if (!blob) {
						reject(new Error('blob'));
						return;
					}
					resolve(blob);
				}, 'image/png');
			}).catch(function (error) {
				sc.dispose();
				reject(error);
			});
		});
	};

	/* ---- the editor ---- */

	api.createAnnotationEditor = function (wrap, image, options) {
		var settings = options || {};
		var tool = 'pen';
		var color = DEFAULT_COLOR;
		var size = DEFAULT_SIZE;
		var font = FONT;
		var history = [];
		var future = [];
		var lastState = '[]';
		var restoring = false;
		var drawing = null;
		var observer = null;

		var el = document.createElement('canvas');
		el.className = 'stillframe-annotation-fabric';
		wrap.appendChild(el);

		var canvas = new fabric.Canvas(el, {
			selection: false,
			preserveObjectStacking: true,
			enableRetinaScaling: true,
			uniformScaling: true,
			snapAngle: 15,
			snapThreshold: 4,
			stopContextMenu: true,
			fireRightClick: false
		});
		canvas.wrapperEl.className += ' stillframe-annotation-wrapper';
		canvas.wrapperEl.style.position = 'absolute';
		var workArea = (wrap.closest && wrap.closest('.stillframe-result__stage')) || wrap.parentElement || wrap;
		blurSource = image;

		function notify() {
			if (typeof settings.onChange === 'function') {
				settings.onChange();
			}
		}

		function unit() {
			return 1 / (canvas.getZoom() || 1);
		}

		function sceneSize() {
			return { w: image.naturalWidth || 1, h: image.naturalHeight || 1 };
		}

		function serialize() {
			return canvas.toObject(PROPS).objects;
		}

		// Record the state before a change, so undo can return to it.
		function commit() {
			if (restoring) {
				return;
			}
			var now = JSON.stringify(serialize());
			if (now === lastState) {
				return;
			}
			history.push(lastState);
			if (history.length > HISTORY_LIMIT) {
				history.shift();
			}
			future = [];
			lastState = now;
			notify();
		}

		function restore(json) {
			restoring = true;
			canvas.discardActiveObject();
			return enliven(JSON.parse(json)).then(function (objects) {
				canvas.remove.apply(canvas, canvas.getObjects());
				objects.forEach(function (obj) {
					canvas.add(obj);
				});
				renumberSteps();
				lastState = JSON.stringify(serialize());
				restoring = false;
				canvas.requestRenderAll();
				notify();
			}).catch(function () {
				restoring = false;
			});
		}

		function renumberSteps() {
			var n = 0;
			canvas.getObjects().forEach(function (obj) {
				if (obj.sfType === 'step') {
					n += 1;
					var label = obj.getObjects()[1];
					if (label && label.text !== String(n)) {
						label.set('text', String(n));
						obj.setCoords();
						obj.dirty = true;
					}
				}
			});
		}

		// Everything past the picture sits under a grey veil: a mark can hang over the edge and stay visible
		// (handles included), but it is clear that only the part on the picture is saved.
		var veilFor = '';
		function ensureVeil() {
			var scene = sceneSize();
			var key = scene.w + 'x' + scene.h;
			if (veilFor === key) {
				return;
			}
			veilFor = key;
			var fill = 'rgba(238,240,243,0.62)';
			try {
				var m = /rgba?((d+),s*(d+),s*(d+)(?:,s*([d.]+))?)/.exec(window.getComputedStyle(workArea).backgroundColor || '');
				if (m && (m[4] === undefined || parseFloat(m[4]) > 0.5)) {
					fill = 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',0.62)';
				}
			} catch (e) {
				// keep the default
			}
			var far = 20000;
			var veil = new fabric.Path('M ' + (-far) + ' ' + (-far) + ' H ' + far + ' V ' + far + ' H ' + (-far) + ' Z M 0 0 V ' + scene.h + ' H ' + scene.w + ' V 0 Z', {
				fill: fill,
				fillRule: 'evenodd',
				stroke: null,
				strokeWidth: 0,
				objectCaching: false,
				selectable: false,
				evented: false,
				left: -far,
				top: -far
			});
			canvas.overlayImage = veil;
			canvas.controlsAboveOverlay = true;
		}

		function resizeCanvas() {
			ensureVeil();
			// The drawing layer covers the whole working area, not just the picture, so marks can be
			// placed and dragged out into the empty space around it (only the picture is exported).
			var rect = image.getBoundingClientRect();
			var area = workArea.getBoundingClientRect();
			var host = wrap.getBoundingClientRect();
			var scene = sceneSize();
			var zoom = Math.max(1, Math.round(rect.width)) / scene.w;
			canvas.wrapperEl.style.left = (area.left - host.left) + 'px';
			canvas.wrapperEl.style.top = (area.top - host.top) + 'px';
			canvas.setDimensions({ width: Math.max(1, Math.round(area.width)), height: Math.max(1, Math.round(area.height)) });
			canvas.setViewportTransform([zoom, 0, 0, zoom, rect.left - area.left, rect.top - area.top]);
			canvas.requestRenderAll();
		}

		// Visible part of the working area, in picture pixels.
		function viewBounds() {
			var vpt = canvas.viewportTransform;
			var zoom = vpt[0] || 1;
			return { left: -vpt[4] / zoom, top: -vpt[5] / zoom, right: (canvas.getWidth() - vpt[4]) / zoom, bottom: (canvas.getHeight() - vpt[5]) / zoom };
		}

		function boundsOf(obj) {
			obj.setCoords();
			return obj.getBoundingRect();
		}

		// Nudge a dragged mark back so its whole box (and so its handles) stays inside the working area.
		function pushInside(obj) {
			var v = viewBounds();
			var m = VIEW_PAD * unit();
			var b = boundsOf(obj);
			var dx = 0;
			var dy = 0;
			if (b.width > v.right - v.left - m * 2 || b.left < v.left + m) {
				dx = v.left + m - b.left;
			} else if (b.left + b.width > v.right - m) {
				dx = v.right - m - (b.left + b.width);
			}
			if (b.height > v.bottom - v.top - m * 2 || b.top < v.top + m) {
				dy = v.top + m - b.top;
			} else if (b.top + b.height > v.bottom - m) {
				dy = v.bottom - m - (b.top + b.height);
			}
			if (dx || dy) {
				obj.set({ left: obj.left + dx, top: obj.top + dy });
				obj.setCoords();
			}
		}

		function isInside(obj) {
			var v = viewBounds();
			var m = VIEW_PAD * unit() - 0.5;
			var b = boundsOf(obj);
			return b.left >= v.left + m && b.top >= v.top + m && b.left + b.width <= v.right - m && b.top + b.height <= v.bottom - m;
		}

		function snapshot(obj) {
			var snap = {};
			SNAP_KEYS.forEach(function (key) {
				if (obj[key] !== undefined) {
					snap[key] = obj[key];
				}
			});
			obj.sfSnap = snap;
			obj.sfSnapFits = isInside(obj);
		}

		// Resizing or turning a mark past the working area stops where it last fitted, so its handles never vanish.
		function holdInside(opt) {
			var obj = opt && opt.target;
			if (!obj) {
				return;
			}
			if (isInside(obj) || !obj.sfSnap) {
				snapshot(obj);
				return;
			}
			if (!obj.sfSnapFits) {
				return; // it started outside, so let it be dragged smaller
			}
			// Back off towards the last fitting state, so a fast drag still lands right at the edge.
			var from = obj.sfSnap;
			var to = {};
			Object.keys(from).forEach(function (key) {
				to[key] = obj[key];
			});
			[0.5, 0.25, 0.12, 0.05, 0].some(function (f) {
				var step = {};
				Object.keys(from).forEach(function (key) {
					step[key] = from[key] + (to[key] - from[key]) * f;
				});
				obj.set(step);
				if (obj.sfType === 'text') {
					obj.initDimensions();
				}
				return isInside(obj);
			});
			snapshot(obj);
		}



		function activeObjects() {
			var active = canvas.getActiveObject();
			if (!active) {
				return [];
			}
			return active.type === 'activeselection' ? active.getObjects() : [active];
		}

		function isEditingText() {
			var active = canvas.getActiveObject();
			return !!(active && active.isEditing);
		}

		function setToolInternal(next) {
			tool = next;
			var mode = next === 'select';
			canvas.isDrawingMode = next === 'pen';
			canvas.selection = mode;
			canvas.skipTargetFind = !mode;
			canvas.defaultCursor = mode ? 'default' : 'crosshair';
			canvas.hoverCursor = mode ? 'move' : 'crosshair';
			if (!mode) {
				canvas.discardActiveObject();
			}
			if (next === 'pen') {
				var brush = new fabric.PencilBrush(canvas);
				brush.color = color;
				brush.width = size * unit();
				brush.strokeLineCap = 'round';
				brush.strokeLineJoin = 'round';
				canvas.freeDrawingBrush = brush;
			}
			canvas.requestRenderAll();
		}

		// After placing a mark, switch to Select so it can be moved or resized straight away.
		function selectAfter(obj) {
			setToolInternal('select');
			if (typeof settings.onToolChange === 'function') {
				settings.onToolChange('select');
			}
			if (obj && canvas.contains(obj)) {
				canvas.setActiveObject(obj);
			}
			canvas.requestRenderAll();
		}

		function scenePoint(event) {
			var v = viewBounds();
			var p = canvas.getScenePoint(event);
			return { x: clamp(p.x, v.left, v.right), y: clamp(p.y, v.top, v.bottom) };
		}

		function constrainPoint(start, p, shape, shift) {
			if (!shift) {
				return p;
			}
			var dx = p.x - start.x;
			var dy = p.y - start.y;
			if (shape === 'arrow') {
				var len = Math.sqrt(dx * dx + dy * dy);
				var angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
				return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
			}
			var side = Math.max(Math.abs(dx), Math.abs(dy));
			return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) };
		}

		function colorFor(type) {
			return type === 'blur' ? '#000000' : color;
		}

		function createShape(type, p) {
			var sw = size * unit();
			var obj;
			if (type === 'rect') {
				obj = new fabric.Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: sw, strokeLineJoin: 'miter', sfType: 'rect' });
			} else if (type === 'circle') {
				obj = new fabric.Ellipse({ left: p.x, top: p.y, rx: 0.5, ry: 0.5, fill: 'rgba(0,0,0,0)', stroke: color, strokeWidth: sw, sfType: 'circle' });
			} else if (type === 'highlight') {
				obj = new fabric.Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: color, opacity: 0.35, strokeWidth: 0, globalCompositeOperation: 'multiply', sfType: 'highlight' });
			} else {
				obj = new fabric.Rect({
					left: p.x,
					top: p.y,
					width: 1,
					height: 1,
					fill: 'rgba(0,0,0,0)',
					strokeWidth: 0,
					sfType: 'blur',
					sfMode: type === 'pixelate' ? 'pixelate' : 'blur',
					sfLevel: Math.round(size * 3 * unit() + 6)
				});
			}
			obj.set({ selectable: true });
			return decorate(obj);
		}

		function updateShape(d, p) {
			var x = Math.min(d.start.x, p.x);
			var y = Math.min(d.start.y, p.y);
			var w = Math.abs(p.x - d.start.x);
			var h = Math.abs(p.y - d.start.y);
			if (d.type === 'arrow') {
				if (d.obj) {
					canvas.remove(d.obj);
				}
				d.obj = makeArrow(d.start.x, d.start.y, p.x, p.y, color, size * unit());
				if (d.obj) {
					canvas.add(d.obj);
				}
				return;
			}
			if (d.type === 'circle') {
				d.obj.set({ left: x, top: y, rx: Math.max(w / 2, 0.5), ry: Math.max(h / 2, 0.5) });
			} else {
				d.obj.set({ left: x, top: y, width: Math.max(w, 1), height: Math.max(h, 1) });
			}
			d.obj.setCoords();
		}

		canvas.on('mouse:down', function (opt) {
			if (tool === 'select' || tool === 'pen' || isEditingText()) {
				return;
			}
			var p = scenePoint(opt.e);
			if (tool === 'step') {
				var n = canvas.getObjects().filter(function (o) { return o.sfType === 'step'; }).length + 1;
				var step = makeStep(p.x, p.y, n, color, (7 + size * 1.2) * unit(), unit(), font, '');
				restoring = true;
				canvas.add(step);
				restoring = false;
				commit();
				return;
			}
			if (tool === 'text') {
				var text = makeText(p.x, p.y, color, (12 + size * 2.5) * unit(), font);
					text.on('changed', function () {
						fitTextWidth(text);
						canvas.requestRenderAll();
					});
				text.on('editing:entered', function () {
					if (text.hiddenTextarea) {
						text.hiddenTextarea.classList.add('stillframe-text-input');
					}
				});
				text.on('editing:exited', function () {
					if (!String(text.text || '').trim()) {
						restoring = true;
						canvas.remove(text);
						restoring = false;
					}
					commit();
					selectAfter(text);
				});
				restoring = true;
				canvas.add(text);
				restoring = false;
				canvas.setActiveObject(text);
				text.enterEditing();
				text.selectAll();
				return;
			}
			drawing = { type: tool, start: p, obj: null, moved: false };
			if (tool !== 'arrow') {
				drawing.obj = createShape(tool, p);
				restoring = true;
				canvas.add(drawing.obj);
				restoring = false;
			}
		});

		canvas.on('mouse:move', function (opt) {
			if (!drawing) {
				return;
			}
			var p = constrainPoint(drawing.start, scenePoint(opt.e), drawing.type, opt.e.shiftKey);
			if (Math.abs(p.x - drawing.start.x) + Math.abs(p.y - drawing.start.y) > 3 * unit()) {
				drawing.moved = true;
			}
			restoring = true;
			updateShape(drawing, p);
			restoring = false;
			canvas.requestRenderAll();
		});

		canvas.on('mouse:up', function () {
			if (!drawing) {
				return;
			}
			var d = drawing;
			drawing = null;
			if (!d.moved) {
				if (d.obj) {
					restoring = true;
					canvas.remove(d.obj);
					restoring = false;
				}
				canvas.requestRenderAll();
				return;
			}
			if (d.obj) {
				d.obj.setCoords();
			}
			commit();
			selectAfter(d.obj);
		});

		canvas.on('path:created', function (opt) {
			if (opt.path) {
				opt.path.set({ sfType: 'pen', sfColor: color, sfSize: size, selectable: true });
				styleControls(opt.path);
			}
			commit();
		});
		// A drag-selected group of marks gets the same solid controls as a single mark.
		function styleSelection() {
			var a = canvas.getActiveObject();
			if (a && String(a.type).toLowerCase() === 'activeselection') {
				styleControls(a);
				a.set({ borderDashArray: null });
			}
		}
		canvas.on('selection:created', styleSelection);
		canvas.on('selection:updated', styleSelection);

		// When a drag ends, a text mark's stretch is folded into its font size, also inside a multi-selection.
		canvas.on('object:modified', function (opt) {
			var t = opt && opt.target;
			if (t && t.sfType === 'text') {
				bakeTextScale(t);
			} else if (t && String(t.type).toLowerCase() === 'activeselection') {
				var members = t.getObjects().slice();
				if (members.some(function (m) { return m.sfType === 'text'; })) {
					canvas.discardActiveObject();
					members.forEach(function (m) {
						if (m.sfType === 'text') {
							bakeTextScale(m);
						}
					});
					canvas.setActiveObject(new fabric.ActiveSelection(members, { canvas: canvas }));
				}
			}
			commit();
			announceSelection();
		});

		function describeSelection() {
			var list = activeObjects();
			if (list.length !== 1) {
				return null;
			}
			var obj = list[0];
			var type = obj.sfType;
			if (type === 'text') {
				return { type: type, color: obj.sfColor || obj.fill, fontSize: Math.round(obj.fontSize), fontMax: Math.max(60, Math.round(sceneSize().h * 0.4)), font: fontKey(obj.fontFamily), bold: String(obj.fontWeight) === '700' || obj.fontWeight === 'bold' };
			}
			if (type === 'step') {
				var circle = obj.getObjects()[0];
				var label = obj.getObjects()[1];
				return { type: type, color: obj.sfColor || circle.fill, numColor: label.fill, font: fontKey(label.fontFamily) };
			}
			if (type === 'rect' || type === 'circle') {
				return { type: type, color: obj.sfColor || obj.stroke, filled: !!obj.sfFilled, dashed: !!obj.sfDashed, rounded: type === 'rect' && (obj.rx || 0) > 0 };
			}
			return { type: type, color: obj.sfColor };
		}

		function fontKey(family) {
			var found = 'sans';
			Object.keys(FONTS).forEach(function (key) {
				if (FONTS[key] === family) {
					found = key;
				}
			});
			return found;
		}

		function announceSelection() {
			if (typeof settings.onSelect === 'function') {
				settings.onSelect(describeSelection());
			}
		}
		// While a text box is dragged larger, report its size so the Size control follows along.
		canvas.on('object:scaling', function (opt) {
			var t = opt && opt.target;
			if (t && t.sfType === 'text' && typeof settings.onTextSize === 'function') {
				settings.onTextSize(Math.round(t.fontSize * t.scaleY));
			}
		});
		canvas.on('object:moving', function (opt) {
			if (opt && opt.target) {
				pushInside(opt.target);
			}
		});
		canvas.on('before:transform', function (opt) {
			if (opt && opt.transform && opt.transform.target) {
				snapshot(opt.transform.target);
			}
		});
		['object:scaling', 'object:resizing', 'object:rotating'].forEach(function (name) {
			canvas.on(name, holdInside);
		});
		canvas.on('selection:created', announceSelection);
		canvas.on('selection:updated', announceSelection);
		canvas.on('selection:cleared', announceSelection);

		function onKeyNudge(event) {
			var step = event.shiftKey ? 10 : 1;
			var dx = event.key === 'ArrowLeft' ? -step : (event.key === 'ArrowRight' ? step : 0);
			var dy = event.key === 'ArrowUp' ? -step : (event.key === 'ArrowDown' ? step : 0);
			if ((!dx && !dy) || isEditingText() || !canvas.getActiveObject()) {
				return;
			}
			var tag = event.target && event.target.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
				return;
			}
			event.preventDefault();
			var active = canvas.getActiveObject();
			active.set({ left: active.left + dx * unit(), top: active.top + dy * unit() });
			active.setCoords();
			canvas.requestRenderAll();
			commit();
		}
		document.addEventListener('keydown', onKeyNudge);

		if (typeof window.ResizeObserver === 'function') {
			observer = new window.ResizeObserver(function () {
				resizeCanvas();
			});
			observer.observe(image);
			if (workArea !== image) {
				observer.observe(workArea);
			}
		}
		window.addEventListener('resize', resizeCanvas);
		window.requestAnimationFrame(resizeCanvas);
		setToolInternal('pen');

		function applyToActive(fn) {
			var changed = false;
			activeObjects().forEach(function (obj) {
				if (fn(obj)) {
					obj.dirty = true;
					changed = true;
				}
			});
			if (changed) {
				canvas.requestRenderAll();
				commit();
			}
		}

		return {
			setTool: function (next) {
				if (TOOLS[next]) {
					setToolInternal(next);
					if (typeof settings.onToolChange === 'function') {
						settings.onToolChange(next);
					}
				}
			},
			setColor: function (next) {
				if (!isColor(next)) {
					return;
				}
				color = next;
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.color = next;
				}
				applyToActive(function (obj) {
					var type = obj.sfType;
					if (type === 'blur') {
						return false;
					}
					obj.sfColor = next;
					if (type === 'arrow') {
						obj.getObjects()[0].set('stroke', next);
						obj.getObjects()[1].set('fill', next);
					} else if (type === 'step') {
						obj.getObjects()[0].set('fill', next);
						if (!obj.sfNumColor) {
							obj.getObjects()[1].set('fill', contrastOn(next));
						}
					} else if (type === 'text' || type === 'highlight') {
						obj.set('fill', next);
					} else {
						obj.set('stroke', next);
						if (obj.sfFilled) {
							obj.set('fill', hexToRgba(next, 0.28));
						}
					}
					return true;
				});
			},
			getSelection: describeSelection,
			setFont: function (key) {
				if (!FONTS[key]) {
					return;
				}
				font = FONTS[key];
				applyToActive(function (obj) {
					if (obj.sfType === 'text') {
						obj.set('fontFamily', font);
						if (!obj.sfManual) {
							fitTextWidth(obj);
						}
						obj.initDimensions();
						obj.setCoords();
						return true;
					}
					if (obj.sfType === 'step') {
						obj.getObjects()[1].set('fontFamily', font);
						return true;
					}
					return false;
				});
				announceSelection();
			},
			setFontSize: function (next) {
				var value = parseFloat(next);
				if (!(value >= 6 && value <= 1200)) {
					return;
				}
				applyToActive(function (obj) {
					if (obj.sfType !== 'text') {
						return false;
					}
					var k = value / obj.fontSize;
					obj.set({ fontSize: value, strokeWidth: textOutline(value) });
					if (obj.sfManual) {
						obj.set('width', obj.width * k);
					} else {
						fitTextWidth(obj);
					}
					obj.initDimensions();
					obj.setCoords();
					return true;
				});
			},
			setBold: function (on) {
				applyToActive(function (obj) {
					if (obj.sfType !== 'text') {
						return false;
					}
					obj.set('fontWeight', on ? '700' : '400');
					if (!obj.sfManual) {
						fitTextWidth(obj);
					}
					obj.initDimensions();
					obj.setCoords();
					return true;
				});
				announceSelection();
			},
			setNumberColor: function (next) {
				if (!isColor(next)) {
					return;
				}
				applyToActive(function (obj) {
					if (obj.sfType !== 'step') {
						return false;
					}
					obj.sfNumColor = next;
					obj.getObjects()[1].set('fill', next);
					return true;
				});
				announceSelection();
			},
			setDashed: function (on) {
				applyToActive(function (obj) {
					if (obj.sfType !== 'rect' && obj.sfType !== 'circle') {
						return false;
					}
					obj.sfDashed = !!on;
					obj.set('strokeDashArray', dashFor(obj));
					return true;
				});
				announceSelection();
			},
			setRounded: function (on) {
				applyToActive(function (obj) {
					if (obj.sfType !== 'rect') {
						return false;
					}
					var r = on ? Math.round(14 * unit()) : 0;
					obj.set({ rx: r, ry: r });
					return true;
				});
				announceSelection();
			},
			setFilled: function (on) {
				applyToActive(function (obj) {
					if (obj.sfType !== 'rect' && obj.sfType !== 'circle') {
						return false;
					}
					obj.sfFilled = !!on;
					obj.set('fill', on ? hexToRgba(obj.sfColor || obj.stroke, 0.28) : 'rgba(0,0,0,0)');
					return true;
				});
				announceSelection();
			},
			setSize: function (next) {
				var value = parseFloat(next);
				if (!(value > 0 && value <= 16)) {
					return;
				}
				size = value;
				if (canvas.freeDrawingBrush) {
					canvas.freeDrawingBrush.width = value * unit();
				}
				applyToActive(function (obj) {
					var type = obj.sfType;
					if (type === 'rect' || type === 'circle' || type === 'pen') {
						obj.set('strokeWidth', value * unit());
						if (obj.sfDashed) {
							obj.set('strokeDashArray', dashFor(obj));
						}
						return true;
					}
					if (type === 'text') {
						var fs = (12 + value * 2.5) * unit();
						obj.set({ fontSize: fs, strokeWidth: textOutline(fs) });
						return true;
					}
					if (type === 'blur') {
						obj.set('sfLevel', Math.round(value * 3 * unit() + 6));
						return true;
					}
					return false;
				});
			},
			undo: function () {
				if (!history.length || isEditingText()) {
					return;
				}
				future.push(lastState);
				var previous = history.pop();
				restore(previous);
			},
			redo: function () {
				if (!future.length || isEditingText()) {
					return;
				}
				history.push(lastState);
				var next = future.pop();
				restore(next);
			},
			clear: function () {
				if (!canvas.getObjects().length) {
					return;
				}
				canvas.discardActiveObject();
				canvas.remove.apply(canvas, canvas.getObjects());
				commit();
				canvas.requestRenderAll();
			},
			selectAll: function () {
				var objects = canvas.getObjects();
				if (!objects.length || isEditingText()) {
					return false;
				}
				setToolInternal('select');
				if (typeof settings.onToolChange === 'function') {
					settings.onToolChange('select');
				}
				canvas.discardActiveObject();
				if (objects.length === 1) {
					canvas.setActiveObject(objects[0]);
				} else {
					canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas: canvas }));
				}
				canvas.requestRenderAll();
				return true;
			},
			deleteSelected: function () {
				var active = activeObjects();
				if (!active.length || isEditingText()) {
					return false;
				}
				canvas.discardActiveObject();
				active.forEach(function (obj) {
					canvas.remove(obj);
				});
				renumberSteps();
				commit();
				canvas.requestRenderAll();
				return true;
			},
			clearSelection: function () {
				if (!canvas.getActiveObject()) {
					return false;
				}
				canvas.discardActiveObject();
				canvas.requestRenderAll();
				return true;
			},
			hasMarks: function () {
				return canvas.getObjects().length > 0;
			},
			getMarks: function () {
				return serialize();
			},
			setMarks: function (newMarks) {
				history = [];
				future = [];
				return restore(JSON.stringify(validMarks(newMarks)));
			},
			// For tests and debugging only.
			getCanvas: function () {
				return canvas;
			},
			flatten: function () {
				return api.flattenImageAndMarks(image, serialize());
			},
			destroy: function () {
				document.removeEventListener('keydown', onKeyNudge);
				window.removeEventListener('resize', resizeCanvas);
				if (observer) {
					observer.disconnect();
					observer = null;
				}
				if (blurSource === image) {
					blurSource = null;
				}
				canvas.dispose();
				if (canvas.wrapperEl && canvas.wrapperEl.parentNode) {
					canvas.wrapperEl.parentNode.removeChild(canvas.wrapperEl);
				}
				history = [];
				future = [];
			}
		};
	};
})();
