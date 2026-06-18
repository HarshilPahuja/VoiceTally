; VoiceTally Inno Setup Script
; Generates a professional setup wizard for Windows users

[Setup]
AppName=VoiceTally
AppVersion=1.0.0
DefaultDirName={localappdata}\VoiceTally
DefaultGroupName=VoiceTally
UninstallDisplayIcon={app}\VoiceTally.exe
Compression=lzma2
SolidCompression=yes
OutputDir=.
OutputBaseFilename=VoiceTallySetup
DisableWelcomePage=no

[Files]
; Compiled executables
Source: "dist_build\VoiceTally.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist_build\voicetally-proxy.exe"; DestDir: "{app}"; Flags: ignoreversion

; Python API & Extract Layers
Source: "requirements.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "app\*"; DestDir: "{app}\app"; Flags: recursesubdirs ignoreversion
Source: "extracting_tally_data\*"; DestDir: "{app}\extracting_tally_data"; Flags: recursesubdirs ignoreversion

; Configuration Templates
Source: ".env.example"; DestDir: "{app}"; DestName: ".env"; Flags: ignoreversion

; TDL Extension
Source: "tdl-extension\voicetally_nlp.tdl"; DestDir: "{app}\tdl-extension"; Flags: ignoreversion
Source: "tdl-extension\launch_voicetally.bat"; DestDir: "{app}\tdl-extension"; Flags: ignoreversion

[Icons]
Name: "{group}\VoiceTally"; Filename: "{app}\VoiceTally.exe"
Name: "{group}\Uninstall VoiceTally"; Filename: "{uninstallexe}"
Name: "{commondesktop}\VoiceTally"; Filename: "{app}\VoiceTally.exe"

[Registry]
; Configure desktop tray client to run silently on system startup
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "VoiceTally"; ValueData: """{app}\VoiceTally.exe"""; Flags: uninsdeletevalue

[Run]
; Auto-initialize python venv and install dependencies silently on post-install
Filename: "{app}\tdl-extension\launch_voicetally.bat"; Description: "Launch VoiceTally services and query window"; Flags: postinstall nowait


[Code]
var
  ConfigPage: TInputQueryWizardPage;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  { Silently kill any running VoiceTally and voicetally-proxy executables }
  Exec(ExpandConstant('{cmd}'), '/c taskkill /F /T /IM VoiceTally.exe /IM voicetally-proxy.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { Kill uvicorn/python backend servers holding file locks on ports 8000 & 8001 }
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), '-Command "Get-NetTCPConnection -LocalPort 3000,8000,8001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  
  Result := '';
end;

procedure InitializeWizard;
begin
  { Create custom config wizard page }
  ConfigPage := CreateInputQueryPage(wpSelectDir,
    'VoiceTally Configuration', 'Tally Company & AI Key Setup',
    'Please configure Tally settings. These can be changed later in config.json and .env.');

  ConfigPage.Add('Tally Company Name (Exact Match):', False);
  ConfigPage.Add('OpenAI API Key (Optional):', False);
  
  { Set default values }
  ConfigPage.Values[0] := 'Demo Company';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  CompanyName: String;
  ApiKey: String;
  ConfigContent: String;
  EnvContent: String;
  ConfigPath: String;
  EnvPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    CompanyName := ConfigPage.Values[0];
    ApiKey := ConfigPage.Values[1];
    
    ConfigPath := ExpandConstant('{app}\extracting_tally_data\config.json');
    EnvPath := ExpandConstant('{app}\.env');

    { Write custom config.json }
    ConfigContent :=
      '{' + #13#10 +
      '  "tally": {' + #13#10 +
      '    "url": "http://localhost:9000",' + #13#10 +
      '    "company_name": "' + CompanyName + '"' + #13#10 +
      '  }' + #13#10 +
      '}';
    SaveStringToFile(ConfigPath, ConfigContent, False);

    { Write root .env file }
    EnvContent :=
      'APP_NAME=VoiceTally Intelligence Service' + #13#10 +
      'APP_VERSION=1.0.0' + #13#10 +
      'DEBUG=True' + #13#10 +
      'STT_PROVIDER=whisper' + #13#10 +
      'OPENAI_API_KEY=' + ApiKey + #13#10;
    SaveStringToFile(EnvPath, EnvContent, False);
  end;
end;
