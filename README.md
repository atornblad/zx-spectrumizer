# ZX Spectrumizer

Simple browser-based toy for converting images to ZX Spectrum screen files.

Select a file from your computer, take a picture with your phone camera, or paste an image from the clipboard.

Save .TAP file or play the loading sound directly from the browser.

Try it out here: https://atornblad.github.io/zx-spectrumizer/

## Release notes

 - **2022-11-08**: You can now pick 'cover' or 'contain' to control how an image fills the canvas. You can also select the filename when saving to .TAP or when playing the loading sound.
 - **2022-09-20**: Handles colors better. Does a better color selection, and adds the option to saturize the image.
 - **2022-06-20**: Nicer user interface, fixed a bug in the loading sound that made real ZX Spectrums stop with the "R Tape loading error" message. Still not very clean code.
 - **2022-06-17**: First release. Not very clean code, probably riddled with bugs, very ugly user interface. Just getting something out there.

## Technology

 - Vanilla JavaScript
 - Clipboard API
 - FileReader
 - Web Audio API
 - AudioWorkletProcessor

