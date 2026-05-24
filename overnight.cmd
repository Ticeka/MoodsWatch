@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\openclaw\overnight.ps1" %*
