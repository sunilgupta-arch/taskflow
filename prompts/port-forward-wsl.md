# WSL2 Port Forwarding to LAN

## Problem
WSL2 runs in a NAT virtual network with its own IP. LAN devices cannot reach apps running inside WSL directly.

## Commands (run in PowerShell as Administrator on Windows)

### 1. Get WSL IP (run in WSL terminal first)
```bash
hostname -I
```
Note the first IP (e.g., `172.24.187.144`).

### 2. Add port proxy
```powershell
netsh interface portproxy add v4tov4 listenport=5600 listenaddress=0.0.0.0 connectport=5600 connectaddress=172.24.187.144
```

### 3. Allow through firewall
```powershell
netsh advfirewall firewall add rule name="TaskFlow 5600" dir=in action=allow protocol=tcp localport=5600
```

### 4. Access from LAN
```
http://<windows-ip>:5600
```
Find Windows IP with `ipconfig` in PowerShell.

## After WSL Restart
WSL IP changes on reboot. Re-run step 1 and 2 with the new IP.

### Remove old proxy and set new
```powershell
netsh interface portproxy delete v4tov4 listenport=5600 listenaddress=0.0.0.0
netsh interface portproxy add v4tov4 listenport=5600 listenaddress=0.0.0.0 connectport=5600 connectaddress=<new-wsl-ip>
```

### Check existing proxies
```powershell
netsh interface portproxy show all
```
