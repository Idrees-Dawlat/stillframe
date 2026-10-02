=== Stillframe – Screenshot Capture & Markup ===
Contributors: idreesdawlat, grafucci
Tags: screenshot, capture, annotate, media library, responsive
Requires at least: 6.4
Tested up to: 7.1
Stable tag: 0.2.0
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Multi-device screenshot capture, responsive previews, and markup studio for WordPress.

== Description ==

Stillframe lets you take screenshots of your WordPress admin area or front-end pages directly inside your browser. Capture responsive desktop, tablet, and mobile views, mark them up with rich annotation tools, and save them straight to your Media Library or download high-resolution PNGs.

### Multi-Device Studio (Tools > Stillframe)
* **Simultaneous Device Capture**: Capture Desktop (1440×900 px), iPad / Tablet (834×1112 px), and Mobile Phone (390×844 px) viewports in a single run.
* **Target Any Page**: Select from any published page or post on your site, or enter any custom URL.
* **Flexible Capture Scope**: Choose between Viewport (above-the-fold) and Full Page (full scrolling height).
* **Retina Resolution Quality**: Export at 1x Standard, 2x Retina (crisp for high-DPI displays), or 3x Ultra.
* **Clean Presentation Mode**: Automatically hide the WordPress admin bar for showcase-ready screenshots.
* **Batch Actions**: Preview all captured devices side-by-side and use "Save All to Media" or "Download All" with one click.

### On-Page Capture Toolbar
* **Camera Icon in Admin Bar**: One-click launch from anywhere on your WordPress site.
* **Area Selection**: Drag to select any custom region with live pixel dimensions and adjust with corner and edge handles.
* **Window / Element Capture**: Hover over any section or element to highlight and capture it cleanly.
* **Full Screen Capture**: Instant one-click capture of the entire visible window.
* **Direct Page & Device Switcher**: Switch pages and preview viewport dimensions directly from the floating capture bar.

### Professional Annotation Suite
* **9 Annotation Tools**:
  * **Select (V)**: Click, marquee drag, Shift-click, or Ctrl+A to multi-select, move, resize, and rotate annotations.
  * **Pen**: Smooth freehand drawing with adjustable stroke size.
  * **Circle / Ellipse**: Highlight areas with circular outlines.
  * **Arrow**: Directional arrows with 45° angle snapping.
  * **Rectangle**: Clean bounding boxes for framing UI elements.
  * **Highlighter**: Semi-transparent color highlight strips.
  * **Text Boxes**: Drag to size, automatic text wrapping, inline typing, and double-click to re-edit.
  * **Numbered Step Badges**: Auto-incrementing step numbers (1, 2, 3...) for creating tutorials and walkthroughs.
  * **Blur / Pixelate**: Redact sensitive client data, passwords, or personal details with a privacy blur tool.
* **Curated Color Palette & Stroke Widths**: Pick harmonious colors and line thicknesses.
* **Full Undo / Redo**: Step back and forth through any edits with keyboard shortcuts (Ctrl+Z).

### Private & Zero Database Footprint
Stillframe runs 100% in your browser using modern client-side rendering. It does not send any data to external servers, adds zero tables or options to your database, and only loads for logged-in administrators with `manage_options` permissions.

== Installation ==

1. Go to **Plugins > Add New** in your WordPress dashboard.
2. Search for **Stillframe** or upload the plugin zip file.
3. Activate the plugin.
4. Click the camera icon in the top admin bar, or go to **Tools > Stillframe** to start capturing.

== Screenshots ==

1. Clean floating capture toolbar with Area selection mode and tooltip on the WordPress dashboard.
2. Window & element capture mode with live pixel dimensions and instant capture button.
3. Devices dropdown: frame and capture standard Desktop (1440px), iPad (834px), and Mobile (390px) viewports on screen.
4. Direct Page capture dropdown: choose target pages, select viewports, toggle clean presentation mode, and select Retina resolution.
5. Annotation Editor Suite: full canvas markup tools including shapes, arrows, text, numbered steps, blur redaction, and instant export.

== Frequently Asked Questions ==

= Who can use Stillframe? =
Only logged-in users with the manage_options capability (administrators). Logged-out visitors do not load any scripts or CSS from this plugin.

= Does Stillframe store images on my server? =
Only if you click Save to Media, which adds one PNG to your Media Library. Downloading saves the image straight to your computer without saving anything to the site or database.

= Does it send data to any outside service? =
No. Rendering and markup happen completely in your browser.

= Does Stillframe leave data in the database? =
No. It does not write options, tables, or transients to your database.

== Development ==

Stillframe is open-source software. You can view the source code, contribute, or submit feedback on [GitHub](https://github.com/Idrees-Dawlat/stillframe).

== Third-party code ==

Stillframe bundles modern-screenshot 4.7.0 (MIT license) as assets/js/vendor/modern-screenshot.js. Source: https://github.com/qq15725/modern-screenshot. The license text is in assets/js/vendor/LICENSE-modern-screenshot.txt.

== Changelog ==

= 0.2.0 =
* Multi-Device Studio: Added full studio under Tools > Stillframe to batch capture Desktop (1440px), iPad/Tablet (834px), and Mobile Phone (390px) views simultaneously.
* Target Page Picker: Capture any published page, post, or custom URL directly without leaving the admin screen.
* Batch Showcase Previews: Added responsive preview cards with one-click "Save All to Media" and "Download All" batch actions.
* Expanded 9-Tool Annotation Suite: Added Select (V), Pen, Circle, Arrow, Rectangle, Highlighter, Text box, Numbered Step badges (1, 2, 3...), and Privacy Blur / Pixelate.
* Advanced Annotation Transforms: Marquee multi-select, Shift-click, Ctrl+A, bounding resize handles, and rotation handles for all marks.
* Resizable & Auto-Wrapping Text: Drag to create text boxes, auto-wrap long text, inline typing, and double-click to edit existing text.
* Direct Page & Viewport Toolbar: Top-bar capture menu now features direct page navigation, viewport presets, and clean presentation toggle.
* Calmer Background Rendering: Eliminated drag stutter on heavy DOM pages with smarter idle rendering and element thresholding.
* Clean UI Polish: Brand styling, rounded close buttons, neutral selected states, and crisp visual feedback across all capture tools.
* Quality & Resolution Controls: Choose between 1x Standard, 2x Retina, and 3x Ultra export resolutions, plus Viewport or Full Page scroll captures.

= 0.1.8 =
* Refined selection tool with clean native white UI, crisp line edge handles, and square corner anchors
* Selection dimensions are cleanly integrated into the floating actions bar
* Window mode now highlights and selects the element first, allowing precision resizing before capture
* Prevented accidental double-click captures: capture only triggers via the Capture button or Enter key
* Prevent background page scrolling while the capture tool or preview modal is open
* Clicking outside the preview modal on the backdrop overlay now cleanly closes it

= 0.1.7 =
* New: after dragging, move or resize the selection with handles, then press Enter or choose Capture
* Fixed garbled text in captures when a plugin uses an image as CSS content
* Fixed the area selection stuttering when the capture toolbar first opens: the background page render now waits until the pointer is idle and is skipped on very heavy pages
* Readme, translation and code-standards cleanup for the WordPress.org review

= 0.1.6 =
* Fixed the Area, Window and Full screen buttons not responding
* Snip overlay, hint and selection now use the brand teal and white look
* Saving to Media and downloading now show a clear floating notice with a View in Media button

= 0.1.5 =
* Toolbar no longer jumps from the right to the center when it opens
* Smoother area dragging: one dim layer instead of four, and the page render waits until the pointer is idle
* Restyled to light surfaces and brand teal, no purple

= 0.1.4 =
* Redesigned capture toolbar with Area, Window and Full screen; the freeform snip is gone
* The result window opens the moment you finish selecting, with Download and Save to Media ready. The page is rendered in the background while you choose, and a click before it is ready finishes automatically
* Downloading or saving an unmarked capture no longer re-renders it
* Fixed scrolled and full screen captures: plugin icon fonts and images now render, fixed elements such as the top bar and side menu stay in place, and the layout no longer shifts
* New markup tools: color palette, three line thicknesses, smoother pen, a cleaner arrow, Shift to draw circles and 45 degree arrows, keyboard shortcuts (P, C, A, Ctrl+Z)

= 0.1.3 =
* Match the capture overlay to the Windows snipping toolbar
* Keep drag selection smooth by capturing only after you release

= 0.1.2 =
* remove the orange outline on the top bar capture control
* speed up screen capture and saving a PNG to the Media Library
* add a camera icon in the top bar and a Stillframe screen under Tools
* add a drag-to-select capture area
* add choices for the top bar, the side menu, and a clean WordPress view without other plugins

= 0.1.1 =
* The capture controls are a small toolbar, so the page stays visible.
* This screen captures the current view without reloading the page.
* Save the PNG to the Media Library, or download it.

= 0.1.0 =
* First release. Administrators can capture the current screen at phone, iPad, desktop, or a custom width, draw with pen, circle, and arrow, and download a PNG.
