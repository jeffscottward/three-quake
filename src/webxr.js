// WebXR support for Three-Quake
// Provides VR rendering via Three.js WebXR integration

import * as THREE from 'three';
import { renderer } from './vid.js';

//============================================================================
// Constants
//============================================================================

// Quake units per meter. Quake uses ~1 unit ≈ 1 inch, so 1 meter ≈ 39.37 units.
// We use 40 for a round number. This scales controller positions from XR meters
// to Quake world units. The camera rig itself is NOT scaled (to preserve the view).
export const XR_SCALE = 40;

//============================================================================
// State
//============================================================================

let xrSessionActive = false;
let xrRig = null; // THREE.Group — camera rig in Quake world space
let controllerGripRight = null; // right controller grip space

//============================================================================
// Public API
//============================================================================

export function isXRActive() {

	return xrSessionActive;

}

export function getXRRig() {

	return xrRig;

}

export function getControllerGripRight() {

	return controllerGripRight;

}

//============================================================================
// XR_Init
//
// Called after Host_Init when renderer and scene are ready.
// Creates the camera rig, sets up controllers, and offers VR session.
//============================================================================

export function XR_Init( scene ) {

	if ( renderer == null ) return;

	// Enable XR on the renderer
	renderer.xr.enabled = true;
	renderer.xr.setReferenceSpaceType( 'local' );

	// Create camera rig — positioned at player vieworg each frame.
	// No scale on the rig (scale would distort lights, particles, and the view).
	// Controller positions are manually scaled in gl_rmain.js instead.
	xrRig = new THREE.Group();
	scene.add( xrRig );

	// Right controller grip space (for weapon attachment)
	controllerGripRight = renderer.xr.getControllerGrip( 0 );
	xrRig.add( controllerGripRight );

	// Session lifecycle
	renderer.xr.addEventListener( 'sessionstart', function () {

		xrSessionActive = true;

	} );

	renderer.xr.addEventListener( 'sessionend', function () {

		xrSessionActive = false;

		// Re-offer VR session so the browser UI remains available
		_offerSession();

	} );

	// Offer VR session to the browser (shows native "Enter VR" UI)
	_offerSession();

}

//============================================================================
// XR_SetCamera
//
// Parents the camera to the XR rig. Called once when the camera is first
// created in R_SetupGL. In non-XR mode the parent doesn't matter because
// camera.matrixAutoUpdate is false and matrixWorld is set directly.
// In XR mode, Three.js composes: rig.matrixWorld × camera.matrix (from headset).
//============================================================================

export function XR_SetCamera( camera ) {

	if ( xrRig != null && camera != null && camera.parent !== xrRig ) {

		xrRig.add( camera );

	}

}

//============================================================================
// Internal: Offer VR session via browser-native UI
//============================================================================

const _sessionInit = {
	optionalFeatures: [ 'local-floor', 'bounded-floor' ]
};

function _offerSession() {

	if ( ! ( 'xr' in navigator ) ) return;
	if ( navigator.xr.offerSession == null ) return;

	navigator.xr.offerSession( 'immersive-vr', _sessionInit )
		.then( _onSessionStarted );

}

function _onSessionStarted( session ) {

	renderer.xr.setSession( session );

}
