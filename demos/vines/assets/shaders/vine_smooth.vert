uniform mat4 viewMat;

attribute vec3 inPos;

void main(void) {
	gl_Position = viewMat * vec4(inPos, 1.);
}