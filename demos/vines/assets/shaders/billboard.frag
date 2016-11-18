precision mediump float;

varying vec2 outUV;
uniform sampler2D tex;

void main(void) {
	gl_FragColor = texture2D(tex, outUV);
	// gl_FragColor = vec4(1., 0., 0., 1.);
}