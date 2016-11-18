
attribute vec2 inPos;
attribute vec4 inColor;
varying vec4 outColor;

void main(void) {
	outColor = inColor / 255.;
	gl_Position = vec4(inPos, 0., 1.);
}