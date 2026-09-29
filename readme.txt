=== Stillframe ===
Contributors: grafucci
Tags: screenshot, capture, annotation, png, design
Requires at least: 6.4
Tested up to: 7.1.2
Stable tag: 0.1.0
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Capture a plugin screen, a theme, or any page at a chosen width, mark it up, and download a PNG.

== Description ==

Plugin and theme authors need a picture of the screen they are already looking at, at a phone, tablet, or desktop width. Stillframe adds an admin-bar item for administrators. It captures that screen at the chosen width and pixel density, lets you draw on the picture, and downloads a PNG.

The capture loads the current URL in a hidden frame at the width you pick, so the page reflows instead of stretching a desktop bitmap. You can mark the picture with a pen, a circle, or an arrow, undo the last mark, or clear every mark. The PNG is flattened only when you download it.

Phone is 390 pixels wide, iPad is 834, and desktop is 1440. A custom width can be any whole number from 320 to 2560. Export scale is 1x, 2x, or 3x. The default scale is 2x.

The downloaded file is named `stillframe-{slug}-{width}w-{scale}x.png`. The slug comes from the path. If the path has no letters or numbers, the name uses `screen`.

Stillframe does not save the picture on the site, does not add a settings screen, and does not load for logged-out visitors. If the page refuses to be framed, Stillframe says so and can capture the current window only. It does not retry with a workaround. If capture fails, the page is left as it was.

Author: Grafucci

== Installation ==

1. Upload the `stillframe` folder to `/wp-content/plugins/`, or install the zip through the Plugins screen.
2. Activate Stillframe through the Plugins screen.
3. Open a front-end page or a wp-admin screen while logged in as an administrator, and choose Stillframe in the admin bar.

== Frequently Asked Questions ==

= Who can use Stillframe? =

Only a logged-in user with the `manage_options` capability. Logged-out visitors receive no HTML, CSS, or JavaScript from this plugin.

= Does it store the PNG on the site? =

No. The PNG downloads to your computer. Version 0.1.0 does not write options, posts, tables, transients, or media-library files.

= What happens if the frame is blocked? =

The panel says the frame was blocked and that the page was not changed. You can capture the current window only. Stillframe does not try to bypass framing rules.

= Will every image be in the PNG? =

A cross-origin image may be omitted. Stillframe does not proxy images through PHP.

= Is there a settings screen? =

No. Width and scale are chosen in the capture panel each time.

== Screenshots ==

This version does not ship screenshot images.

== Changelog ==

= 0.1.0 =
* First release. Administrators can capture the current screen at phone, iPad, desktop, or a custom width, draw with pen, circle, and arrow, and download a PNG.
