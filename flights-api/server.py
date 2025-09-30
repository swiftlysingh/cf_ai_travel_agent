#!/usr/bin/env python3
"""
Flights API Server
A simple HTTP server that wraps the flights-cli tool for use with Cloudflare Workers.
This server receives flight search requests via HTTP and executes flights-cli commands.
"""

import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse


class FlightsAPIHandler(BaseHTTPRequestHandler):
    """HTTP request handler for flight search API"""

    def _set_headers(self, status_code=200, content_type="application/json"):
        """Set response headers"""
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        """Handle preflight CORS requests"""
        self._set_headers(204)

    def do_POST(self):
        """Handle POST requests for flight searches"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path != "/api/flights":
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())
            return

        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            params = json.loads(body)

            # Build flights-cli command
            cmd = self._build_command(params)
            
            print(f"Executing command: {' '.join(cmd)}", file=sys.stderr)

            # Execute the command
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60  # 60 second timeout
            )

            if result.returncode != 0:
                self._set_headers(500)
                error_response = {
                    "error": "flights-cli execution failed",
                    "stderr": result.stderr,
                    "stdout": result.stdout
                }
                self.wfile.write(json.dumps(error_response).encode())
                return

            # Try to parse as JSON if it looks like JSON
            response_data = result.stdout
            if response_data.strip().startswith("{") or response_data.strip().startswith("["):
                try:
                    parsed = json.loads(response_data)
                    self._set_headers(200)
                    self.wfile.write(json.dumps(parsed).encode())
                except json.JSONDecodeError:
                    # If JSON parsing fails, return as text
                    self._set_headers(200, "text/plain")
                    self.wfile.write(response_data.encode())
            else:
                # Return as text
                self._set_headers(200, "text/plain")
                self.wfile.write(response_data.encode())

        except subprocess.TimeoutExpired:
            self._set_headers(504)
            self.wfile.write(json.dumps({"error": "Request timeout"}).encode())
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _build_command(self, params):
        """Build flights-cli command from parameters"""
        cmd = ["flights-cli"]

        # Add trip type
        trip_type = params.get("tripType")
        if trip_type == "one-way":
            cmd.append("--one")
        elif trip_type == "round-trip":
            cmd.append("--round")
        elif trip_type == "multi-city":
            cmd.append("--multi")

        # Add segments
        segments = params.get("segments", [])
        for segment in segments:
            segment_str = f"date={segment['date']} from={segment['from']} to={segment['to']}"
            
            if "maxStops" in segment:
                segment_str += f" max_stops={segment['maxStops']}"
            
            if "airlines" in segment:
                segment_str += f" airlines={segment['airlines']}"
            
            cmd.extend(["--segment", segment_str])

        # Add global max stops
        if "maxStops" in params:
            cmd.extend(["--max-stops", str(params["maxStops"])])

        # Add cabin class
        if "cabinClass" in params:
            cmd.extend(["--class", params["cabinClass"]])

        # Add fetch mode
        if "fetchMode" in params:
            cmd.extend(["--fetch-mode", params["fetchMode"]])

        # Add data source
        if "dataSource" in params:
            cmd.extend(["--data-source", params["dataSource"]])

        # Add passenger counts
        if "adults" in params:
            cmd.extend(["-a", str(params["adults"])])
        
        if "children" in params and params["children"] > 0:
            cmd.extend(["-c", str(params["children"])])
        
        if "infantsInSeat" in params and params["infantsInSeat"] > 0:
            cmd.extend(["--infants-in-seat", str(params["infantsInSeat"])])
        
        if "infantsOnLap" in params and params["infantsOnLap"] > 0:
            cmd.extend(["--infants-on-lap", str(params["infantsOnLap"])])

        # Add best-only flag
        if params.get("bestOnly", False):
            cmd.append("--best-only")

        # Add JSON output flags
        if params.get("jsonOutput", True):
            cmd.append("--json")
        
        if params.get("prettyPrint", True):
            cmd.append("--pretty")

        return cmd

    def log_message(self, format, *args):
        """Custom log message to stderr"""
        sys.stderr.write(f"{self.address_string()} - [{self.log_date_time_string()}] {format % args}\n")


def check_flights_cli():
    """Check if flights-cli is installed"""
    try:
        result = subprocess.run(
            ["flights-cli", "--help"],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def main():
    """Main entry point"""
    # Check if flights-cli is installed
    if not check_flights_cli():
        print("\n❌ ERROR: flights-cli is not installed!", file=sys.stderr)
        print("\nPlease run the setup script first:", file=sys.stderr)
        print("  cd flights-api", file=sys.stderr)
        print("  ./setup.sh", file=sys.stderr)
        print("\nOr manually install in a virtual environment:", file=sys.stderr)
        print("  python3 -m venv venv", file=sys.stderr)
        print("  source venv/bin/activate", file=sys.stderr)
        print("  pip install git+https://github.com/swiftlysingh/flights-cli", file=sys.stderr)
        print("", file=sys.stderr)
        sys.exit(1)
    
    print("✓ flights-cli is installed", file=sys.stderr)

    # Start the server
    host = "localhost"
    port = 8787
    
    server = HTTPServer((host, port), FlightsAPIHandler)
    print(f"\nFlights API Server running on http://{host}:{port}", file=sys.stderr)
    print(f"Endpoint: http://{host}:{port}/api/flights", file=sys.stderr)
    print("\nPress Ctrl+C to stop the server\n", file=sys.stderr)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...", file=sys.stderr)
        server.shutdown()


if __name__ == "__main__":
    main()
