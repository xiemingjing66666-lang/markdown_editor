#define AppName "纸间"
#define AppVersion "0.4.0"
#define AppPublisher "纸间"
#define AppExeName "Zhijian.exe"

[Setup]
AppId={{2189DD16-7F67-4014-96BF-EC4BE32EB733}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppCopyright=Copyright (c) 2026
DefaultDirName={autopf}\Zhijian
DisableDirPage=no
DisableProgramGroupPage=yes
DefaultGroupName=纸间
PrivilegesRequired=admin
OutputDir=..\release
OutputBaseFilename=Zhijian-Setup-{#AppVersion}
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} 安装程序
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
ChangesAssociations=yes
SetupLogging=yes
AllowNoIcons=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："
Name: "associate"; Description: "将纸间加入 Markdown 文件的打开方式"; GroupDescription: "文件关联："

[Files]
Source: "..\release\Zhijian\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Classes\Zhijian.md"; ValueType: string; ValueName: ""; ValueData: "Markdown 文档"; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Zhijian.md\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\Zhijian.exe,0"; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Zhijian.md\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Zhijian.exe"" ""%1"""; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Zhijian.exe"; ValueType: string; ValueName: "FriendlyAppName"; ValueData: "纸间"; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Zhijian.exe\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Zhijian.exe"" ""%1"""; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Zhijian.exe\SupportedTypes"; ValueType: string; ValueName: ".md"; ValueData: ""; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\Zhijian.exe\SupportedTypes"; ValueType: string; ValueName: ".markdown"; ValueData: ""; Tasks: associate; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "Zhijian.md"; ValueData: ""; Tasks: associate; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "Zhijian.md"; ValueData: ""; Tasks: associate; Flags: uninsdeletevalue

[Icons]
Name: "{autoprograms}\纸间"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\纸间"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "启动纸间"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
function IsAsciiPath(const Value: String): Boolean;
var
  Index: Integer;
begin
  Result := True;
  for Index := 1 to Length(Value) do
  begin
    if Ord(Value[Index]) > 127 then
    begin
      Result := False;
      Exit;
    end;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    if not IsAsciiPath(WizardDirValue) then
    begin
      MsgBox('纸间的 .NET 运行时目前不支持含中文的安装路径。请选择只含英文字母、数字和空格的路径。', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not IsAsciiPath(ExpandConstant('{app}')) then
    Result := '纸间需要安装到纯英文路径。请返回上一步，选择只含英文字母、数字和空格的路径。';
end;
