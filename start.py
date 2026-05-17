import subprocess
import sys
import os
import time
import socket

def get_local_ip():
    """Get this laptop's IP on the local network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def build_dashboard():
    """Build React dashboard if dist folder doesn't exist or is outdated."""
    dist = os.path.join("dashboard", "dist")
    if not os.path.exists(dist):
        print("Building dashboard...")
        subprocess.run(["npm", "run", "build"], cwd="dashboard", check=True)
        print("Dashboard built.")
    else:
        print("Dashboard already built. Skipping build.")

def main():
    print("\n" + "="*55)
    print("   ClassroomAI Monitor — BYTEHACK 2026")
    print("="*55)

    # Build dashboard
    build_dashboard()

    ip = get_local_ip()

    print(f"\n Starting server...")
    print(f"\n Open dashboard on THIS laptop:")
    print(f"   http://localhost:8000")
    print(f"\n Share with anyone on same WiFi:")
    print(f"   http://{ip}:8000")
    print(f"\n Press Ctrl+C to stop everything.\n")
    print("="*55 + "\n")

    # Start FastAPI (serves both API and dashboard)
    api_proc = subprocess.Popen([
        sys.executable, "-m", "uvicorn",
        "api.main:app",
        "--host", "0.0.0.0",   # 0.0.0.0 = accessible on WiFi
        "--port", "8000",
        "--reload"
    ])

    # Wait for API to start
    time.sleep(3)

    # Start vision pipeline
    print("Starting vision pipeline...")
    vision_proc = subprocess.Popen([
        sys.executable, "vision/detect.py"
    ])

    print("All systems running!\n")

    try:
        # Keep running until Ctrl+C
        api_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down...")
        api_proc.terminate()
        vision_proc.terminate()
        print("Done.")

if __name__ == "__main__":
    main()