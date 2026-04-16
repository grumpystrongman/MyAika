"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function AvatarRenderer({
  modelUrl = "/models/aika.glb",
  characterSpec = null,
  expressionMap = null,
  onLoadComplete = null,
  onError = null,
  width = 800,
  height = 600,
  quality = "high"
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const modelRef = useRef(null);
  const animationFrameRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ fps: 0, renderTime: 0 });

  useEffect(() => {
    const initScene = async () => {
      try {
        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0a);
        sceneRef.current = scene;

        // Camera setup - optimized for avatar conversation
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 0.15, 0.8);
        camera.lookAt(0, 0.15, 0);
        cameraRef.current = camera;

        // Renderer setup
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2", {
          antialias: true,
          alpha: true,
          precision: quality === "high" ? "highp" : "mediump",
          powerPreference: quality === "high" ? "high-performance" : "default"
        });

        const renderer = new THREE.WebGLRenderer({
          canvas,
          context,
          antialias: true,
          alpha: true
        });

        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        rendererRef.current = renderer;

        containerRef.current?.appendChild(canvas);

        // Lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(0.5, 0.8, 0.8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        scene.add(keyLight);

        const rimLight = new THREE.DirectionalLight(0xff00ff, 0.3);
        rimLight.position.set(-0.5, 0.5, -1);
        scene.add(rimLight);

        const fillLight = new THREE.DirectionalLight(0x0099ff, 0.2);
        fillLight.position.set(-0.5, 0.3, 0.5);
        scene.add(fillLight);

        // Load model
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);
        const model = gltf.scene;

        model.scale.set(1, 1, 1);
        model.position.set(0, 0, 0);
        model.castShadow = true;
        model.receiveShadow = true;

        // Process materials for PBR
        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;

            if (node.material) {
              if (node.material.isMeshStandardMaterial) {
                node.material.metalness = 0.0;
                node.material.roughness = 0.6;
              }

              node.material.side = THREE.FrontSide;
            }
          }
        });

        scene.add(model);
        modelRef.current = model;

        // Morphtarget preparation
        const morphTargetInfo = {
          count: 0,
          names: [],
          influences: []
        };

        model.traverse((node) => {
          if (node.isMesh && node.morphTargetInfluences) {
            morphTargetInfo.count = node.morphTargetInfluences.length;
            if (node.morphTargetDictionary) {
              morphTargetInfo.names = Object.keys(node.morphTargetDictionary);
            }
            morphTargetInfo.influences = [...node.morphTargetInfluences];
          }
        });

        // Animation loop
        let frameCount = 0;
        let lastTime = Date.now();

        const animate = () => {
          animationFrameRef.current = requestAnimationFrame(animate);

          const currentTime = Date.now();
          const deltaTime = (currentTime - lastTime) / 1000;
          lastTime = currentTime;

          renderer.render(scene, camera);

          frameCount++;
          if (frameCount % 30 === 0) {
            const fps = Math.round(1 / deltaTime);
            setStats({ fps, renderTime: deltaTime * 1000 });
          }
        };

        animate();

        setIsLoading(false);
        if (onLoadComplete) {
          onLoadComplete({
            scene,
            camera,
            renderer,
            model,
            morphTargetInfo
          });
        }
      } catch (error) {
        console.error("Failed to initialize avatar scene:", error);
        setError(error.message);
        if (onError) {
          onError(error);
        }
      }
    };

    initScene();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [modelUrl, width, height, quality, onLoadComplete, onError]);

  return (
    <div className="avatar-container" style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          position: "relative",
          overflow: "hidden",
          borderRadius: "12px",
          background: "#0a0a0a"
        }}
      />

      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 10, 10, 0.9)",
            color: "#fff",
            zIndex: 10
          }}
        >
          <div>Loading avatar...</div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 10, 10, 0.95)",
            color: "#ff4444",
            zIndex: 10,
            padding: "20px"
          }}
        >
          <div>Error: {error}</div>
        </div>
      )}

      {!isLoading && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            fontSize: "12px",
            color: "#888",
            background: "rgba(0, 0, 0, 0.5)",
            padding: "5px 10px",
            borderRadius: "4px",
            fontFamily: "monospace"
          }}
        >
          {stats.fps} FPS | {stats.renderTime.toFixed(1)}ms
        </div>
      )}
    </div>
  );
}
