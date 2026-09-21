# Earth imagery

`earth.js` embeds two JPEG images as data URIs in a classic script. This keeps
WebGL texture uploads and PNG exports origin-clean when the app is opened by
double-click, without a server or network request.

## Sources and attribution

Surface: NASA Earth Observatory, Blue Marble: Next Generation, July 2004,
with topography and bathymetry. NASA imagery, courtesy of NASA Earth Observatory.

- Collection: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
- Original 5400 x 2700 JPEG: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg
- Bundled derivative: 4096 x 2048, Lanczos resampling, JPEG quality 91, optimized.

Clouds: NASA Goddard Space Flight Center, Blue Marble: Clouds, Reto Stoeckli.

- Original 2048 x 1024 JPEG, bundled without modification: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- Historical catalog: https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/77558l

Retrieved 2026-09-05. These are historical composites, not live weather. The
surface and cloud composites represent different dates. Cloud drift is artistic.
NASA attribution is separate from the application code's MIT license; no NASA
endorsement is implied.

## Renderer conventions

The color image uses sRGB; cloud intensity is an untagged linear alpha mask.
Geography is rotated so 28.5 N, 80.6 W maps to the simulation's launch radial
axis. Ascent's positive horizontal axis points east. No physics values change.

GPU textures are created after each image decodes. Reusing the 1-pixel fallback's
GPU allocation for a larger image would silently lose the intended detail.
Browser integration tests render the satellite texture into a small target and
read its pixels, as well as testing 4K capture entirely offline.
