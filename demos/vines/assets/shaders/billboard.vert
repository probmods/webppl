uniform mat4 viewMat;

attribute vec3 inPos;
attribute vec2 inUV;
varying vec2 outUV;

void main(void) {
	outUV = inUV;
	gl_Position = viewMat * vec4(inPos, 1.);
}