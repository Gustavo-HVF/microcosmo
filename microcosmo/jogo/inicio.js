// touch screen (phone, tablet): set before the intro paints, so its text
// and the controls card already explain the touch gestures
if(window.matchMedia && matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
if(window.matchMedia && matchMedia('(max-width: 820px), (max-height: 520px)').matches) document.body.classList.add('phone');
