// WebXR support for Three-Quake
// Provides VR rendering via Three.js WebXR integration

import * as THREE from 'three';
import { renderer } from './vid.js';

//============================================================================
// Constants
//============================================================================

// Quake units per meter. Tuned so that a 1.7m-tall user maps to ~56 Quake
// units (the player collision hull height), making enemies, doorways, and
// hallways feel correctly proportioned in VR.
export const XR_SCALE = 30;

//============================================================================
// Pre-allocated temp objects (Golden Rule #4)
//============================================================================

const _gripWorldPos = new THREE.Vector3();
const _gripWorldQuat = new THREE.Quaternion();

//============================================================================
// State
//============================================================================

let xrSessionActive = false;
let xrRig = null; // THREE.Group — NOT in scene, positioned at vieworg/XR_SCALE each frame
let controllerGripRight = null; // right controller grip space
let _scene = null; // scene reference for scale toggling

// Input state — polled each frame by XR_PollInput(), consumed by IN_Move()
export const xrInput = {
	moveX: 0,       // left thumbstick X (-1 to 1)
	moveY: 0,       // left thumbstick Y (-1 to 1)
	lookX: 0,       // right thumbstick X (-1 to 1)
	leftTrigger: 0, // left trigger (0 to 1)
	rightTrigger: 0 // right trigger (0 to 1)
};

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
//
// The rig is NOT added to the scene. Instead, the scene is scaled down
// by 1/XR_SCALE when XR is active, putting everything in meter space.
// The rig (also in meter space) is positioned at vieworg / XR_SCALE.
// This way the XR camera and scene content are in the same units.
//============================================================================

export function XR_Init( scene ) {

	if ( renderer == null ) return;

	_scene = scene;

	// Enable XR on the renderer
	renderer.xr.enabled = true;
	renderer.xr.setReferenceSpaceType( 'local' );

	// Create camera rig — NOT a child of scene.
	// Positioned at vieworg / XR_SCALE (meters) each frame.
	// Three.js XR composes: rig.matrixWorld × camera.matrix (headset pose).
	xrRig = new THREE.Group();

	// Right controller targetRay (pointer) space — aims where the user points
	// Index 0 is left hand on Quest, 1 is right hand
	controllerGripRight = renderer.xr.getController( 1 );
	xrRig.add( controllerGripRight );

	// Session lifecycle
	renderer.xr.addEventListener( 'sessionstart', function () {

		xrSessionActive = true;

		// Scale scene to meters so it matches XR coordinate space
		if ( _scene != null ) _scene.scale.setScalar( 1 / XR_SCALE );

	} );

	renderer.xr.addEventListener( 'sessionend', function () {

		xrSessionActive = false;

		// Restore scene scale for non-XR rendering
		if ( _scene != null ) _scene.scale.setScalar( 1 );

		_offerSession();

	} );

	_offerSession();

}

//============================================================================
// XR_SetCamera
//
// Parents the camera to the XR rig. Called once when the camera is first
// created in R_SetupGL. In non-XR mode the parent doesn't matter because
// camera.matrixAutoUpdate is false and matrixWorld is set directly.
// In XR mode, Three.js composes: rig.matrixWorld × camera.matrix (headset pose).
//============================================================================

export function XR_SetCamera( camera ) {

	if ( xrRig != null && camera != null && camera.parent !== xrRig ) {

		xrRig.add( camera );

	}

}


//============================================================================
// XR_PollInput
//
// Reads controller gamepad state each frame. Called from IN_Move().
// Left controller: thumbstick → movement, trigger → jump
// Right controller: trigger → attack
//============================================================================

export function XR_PollInput() {

	xrInput.moveX = 0;
	xrInput.moveY = 0;
	xrInput.lookX = 0;
	xrInput.leftTrigger = 0;
	xrInput.rightTrigger = 0;

	if ( xrSessionActive === false ) return;

	const session = renderer.xr.getSession();
	if ( session == null ) return;

	for ( const source of session.inputSources ) {

		if ( source.gamepad == null ) continue;

		const gp = source.gamepad;

		if ( source.handedness === 'left' ) {

			// Thumbstick axes (xr-standard: axes[2]=X, axes[3]=Y)
			// Some controllers use axes[0]/[1] instead
			if ( gp.axes.length >= 4 ) {

				xrInput.moveX = gp.axes[ 2 ];
				xrInput.moveY = gp.axes[ 3 ];

			} else if ( gp.axes.length >= 2 ) {

				xrInput.moveX = gp.axes[ 0 ];
				xrInput.moveY = gp.axes[ 1 ];

			}

			// Trigger (buttons[0] in xr-standard)
			if ( gp.buttons.length > 0 ) {

				xrInput.leftTrigger = gp.buttons[ 0 ].value;

			}

		} else if ( source.handedness === 'right' ) {

			// Thumbstick X axis (horizontal look)
			if ( gp.axes.length >= 4 ) {

				xrInput.lookX = gp.axes[ 2 ];

			} else if ( gp.axes.length >= 2 ) {

				xrInput.lookX = gp.axes[ 0 ];

			}

			// Trigger
			if ( gp.buttons.length > 0 ) {

				xrInput.rightTrigger = gp.buttons[ 0 ].value;

			}

		}

	}

}

//============================================================================
// XR_GetGripWorldPose
//
// Returns the grip's world-space position and quaternion.
// With scene.scale = 1/XR_SCALE, the grip's world position is in meters.
// The caller converts to scene-local Quake units by multiplying by XR_SCALE.
//
// Returns false if grip or XR is not available.
//============================================================================

export function XR_GetGripWorldPose( outPos, outQuat ) {

	if ( xrSessionActive === false ) return false;
	if ( controllerGripRight == null ) return false;
	if ( xrRig == null ) return false;

	// getWorldPosition/getWorldQuaternion call updateWorldMatrix internally
	controllerGripRight.getWorldPosition( outPos );
	controllerGripRight.getWorldQuaternion( outQuat );

	return true;

}

//============================================================================
// Internal: Offer VR session via browser-native UI
//============================================================================

const _sessionInit = {
	requiredFeatures: [ 'local' ]
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
