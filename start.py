import subprocess
import sys
import os
import time
import socket
import webbrowser
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def build_dashboard():
    dist = os.path.join(ROOT, "dashboard", "dist")
    if not os.path.exists(dist):
        print("Building dashboard...")
        subprocess.run(["npm", "run", "build"], cwd=os.path.join(ROOT, "dashboard"), check=True)
        print("Dashboard built.")
    else:
        print("Dashboard already built. Skipping build.")

def wait_for_server(url, timeout=20):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False

def terminate_process(proc, name):
    if proc.poll() is None:
        print(f"Stopping {name}...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            print(f"{name} did not stop in time. Killing it...")
            proc.kill()

def main():
    print("\n" + "=" * 55)
    print("   ClassroomAI Monitor — BYTEHACK 2026")
    print("=" * 55)

    build_dashboard()

    ip = get_local_ip()
    local_url = "http://localhost:8000"
    lan_url = f"http://{ip}:8000"

    print(f"\nStarting server...")
    print(f"\nOpen dashboard on THIS laptop:")
    print(f"  {local_url}")
    print(f"\nShare with anyone on same WiFi:")
    print(f"  {lan_url}")
    print(f"\nUse the dashboard Stop Detection button to end only the session.")
    print(f"Press Ctrl+C in this terminal only when you want to close the whole app.\n")
    print("=" * 55 + "\n")

    api_proc = subprocess.Popen([
        sys.executable, "-m", "uvicorn",
        "api.main:app",
        "--host", "0.0.0.0",
        "--port", "8000"
    ], cwd=ROOT)

    if wait_for_server(local_url):
        print("Server is live. Opening browser...\n")
        webbrowser.open(local_url)
    else:
        print("Server did not respond in time. Open the dashboard manually.\n")

    print("Starting vision pipeline...")
    vision_proc = subprocess.Popen([
        sys.executable, os.path.join("vision", "detect.py")
    ], cwd=ROOT)

    print("All systems running!\n")

    try:
        while True:
            if api_proc.poll() is not None:
                print("API server stopped unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down ClassroomAI Monitor...\n")
    finally:
        terminate_process(vision_proc, "vision pipeline")
        terminate_process(api_proc, "API server")
        print("Done.")

if __name__ == "__main__":
    main()