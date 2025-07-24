document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("niftiInput");

    input.addEventListener("change", function () {
        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = function () {
            const data = reader.result;

            if (nifti.isCompressed(data)) {
                const decompressed = nifti.decompress(data);
                if (nifti.isNIFTI(decompressed)) {
                    const header = nifti.readHeader(decompressed);
                    const image = nifti.readImage(header, decompressed);
                    renderVolume(header, image);
                }
            } else if (nifti.isNIFTI(data)) {
                const header = nifti.readHeader(data);
                const image = nifti.readImage(header, data);
                renderVolume(header, image);
            } else {
                alert("Geen geldig NIfTI-bestand.");
            }
        };

        reader.readAsArrayBuffer(file);
    });

    function renderVolume(header, imageData) {
        const width = header.dims[1];
        const height = header.dims[2];
        const depth = header.dims[3];

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        camera.position.z = Math.max(width, height, depth) * 1.5;

        function animate() {
            requestAnimationFrame(animate);
            cube.rotation.x += 0.01;
            cube.rotation.y += 0.01;
            renderer.render(scene, camera);
        }

        animate();
    }
});
