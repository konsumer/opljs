# opl.js

This is a Javascript wrapper around the OPL3 emulator included in DOSBox.  It
allows OPL-compatible FM synthesis from within Javascript code, running in Node
or in the browser.

The emulator is written in C++ and compiled to Javascript WebAssembly with
Emscripten.  A small wrapper is provided to simplify the interface between the
C++ code and the Javascript code.

Example code is provided, both for the Node environment (with `import`) and
for the browser (using `<script/>`).

## Installation
```
npm install @konsumer/opl
```

You can also use it on the web, with a CDN:

```html
<script type="importmap">
  {
    "imports": {
      "@konsumer/opl": "https://esm.sh/@konsumer/opl"
    }
  }
</script>
<script type="module">
import OPL from '@konsumer/opl'
</script>
```

## Use

```js
import OPL from '@konsumer/opl';

OPL.create().then(opl => {
    opl.write(0xBD, 0x20);
    const samples = opl.generate(512);
    // samples now contains 512 16-bit stereo samples as a Uint8Array
});
```


## Examples

In the `examples/` folder there are some short demonstrations showing how to
interface with the OPL emulator.

The web example will not work if loading the HTML file directly, as some browsers
do not like loading WebAssembly files from `file://` URLs.  To run this example,
you can either upload it somewhere or use Node to run `npm start` which
will run a static web-server to host the necessary files.


Included is `local.html` that uses the wasm built here, and `index.html` that accesses it, using the CDN (so you don't need to build it.)

## Limitations

The library is only focused on generating the audio.  It does not feature any
sort of playback or audio mixing mechanism, as this is likely to be very
different for different projects.  You will need to include another library in
your project if you wish to play the generated audio.  The web example shows how
to use WebAudio for playback in the browser, and the Node example shows how to
save the generated audio to a .wav file instead.

8-bit and floating point audio formats are not supported.  You can still use
these formats, but you'll need to convert the signed 16-bit samples into these
formats yourself.  The WebAudio sample code shows conversion to floating point.

No compression is directly supported (DRO, etc) but you can use a decompression library like [pako](https://github.com/nodeca/pako).

## Contributing

When you install the release with `npm` the WebAssembly binary is included.
This is not part of the git repository, so if you clone the repo you will need
to install `emscripten` in order to compile the C++ code into Javascript.

Once `emscripten` is installed, run:

```sh
npm run build
```

This will compile the C++ code in `src/` and put the compiled files into `lib/`.


Now, you can run


```sh
npm start
```


and visit the [local built version](http://127.0.0.1:8080/local.html).

## related works

Check out these, as well:

- [doomjs](https://github.com/doomjs/opl3)
- [opl_plr_js](http://software.kvee.cz/opl_plr_js/)
- [vgmtools](https://github.com/vgmrips/vgmtools)


## Copyright

This project is copyrighted [GPLv3](LICENSE).

- Current Javascript wrapper: David Konsumer <<konsumer@jetboystudio.com>>
- Original Javascript wrapper: Copyright 2010-2018 Adam Nielsen <<malvineous@shikadi.net>>
- OPL emulator: Copyright 2002-2015 The DOSBox Team

