; O instalador do MaiSim para Windows (Inno Setup 6), montado por pacote/windows/monta.sh. Instala só para quem usa
; (sem pedir administrador) em %LOCALAPPDATA%\Programs\MaiSim, com tudo dentro (Python + NumPy, Java, o Gecko, o motor,
; o Monaco). Pergunta a pasta dos circuitos (Documentos\MaiSim) e a porta (7100; confere se está livre — o WSL repassa as
; portas do MaiSim de lá para o Windows) e grava as duas em %APPDATA%\MaiSim\maisim.env (a config pessoal do perfil
; produto, que fica nas atualizações). Desinstalar pergunta se apaga também os dados (o padrão: não).
#ifndef Versao
  #define Versao "0.0.0"
#endif
#ifndef Fonte
  #define Fonte "..\.build\win\MaiSim"
#endif
#ifndef Imagens
  #define Imagens "..\.build\win\imagens"
#endif
#define Nome "MaiSim"
#define Pythonw "{app}\python\pythonw.exe"
#define Lancador "{app}\maisim\app\lancador.py"

[Setup]
AppId={{8E3F2A61-5C4D-4B7E-9F1A-2D6C8B0E4A57}
AppName={#Nome}
AppVersion={#Versao}
AppVerName={#Nome} {#Versao}
AppPublisher=Marcelo Pedroso
AppPublisherURL=https://maisim.org
DefaultDirName={localappdata}\Programs\{#Nome}
DefaultGroupName={#Nome}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=MaiSim-Setup-{#Versao}
SetupIconFile={#Imagens}\maisim.ico
UninstallDisplayIcon={app}\maisim.ico
UninstallDisplayName={#Nome}
WizardStyle=modern
WizardImageFile={#Imagens}\wizard.bmp,{#Imagens}\wizard_200.bmp
WizardSmallImageFile={#Imagens}\wizard_pequeno.bmp,{#Imagens}\wizard_pequeno_200.bmp
LicenseFile=..\..\LICENSE
Compression=lzma2/max
SolidCompression=yes
LZMANumBlockThreads=4
CloseApplications=no
ShowLanguageDialog=yes

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"; InfoAfterFile: "creditos_pt.txt"
Name: "en"; MessagesFile: "compiler:Default.isl"; InfoAfterFile: "creditos_en.txt"

[CustomMessages]
pt.DadosTitulo=Onde ficam os seus circuitos
pt.DadosSub=Os circuitos, as rodadas e os contextos da IA ficam numa pasta à vista.
pt.DadosTexto=O MaiSim guarda o que você faz nesta pasta (ela fica mesmo se você desinstalar):
pt.DadosNoPrograma=Escolha uma pasta fora da pasta do programa (%1): a pasta do programa é trocada a cada atualização.
pt.PortaTitulo=Porta
pt.PortaSub=O endereço do MaiSim no seu navegador: http://localhost:<porta>
pt.PortaTexto=O MaiSim usa esta porta e as 6 seguintes. Se você já roda outro MaiSim (no WSL, por exemplo), escolha outra.
pt.PortaRotulo=Porta (1024 a 65000):
pt.PortaInvalida=A porta precisa ser um número de 1024 a 65000.
pt.PortaBloqueada=A porta %1 é recusada pelos navegadores (o MaiSim usa ela e as 6 seguintes). Usar a %2?
pt.PortaOcupada=A porta %1 já está em uso neste computador (outro MaiSim, ou o WSL repassando a porta de lá). Usar a %2?
pt.Abrir=Abrir o MaiSim agora (a primeira vez leva até um minuto)
pt.Desligar=Desligar o MaiSim
pt.PastaCircuitos=Pasta dos meus circuitos
pt.ApagarDados=Apagar também os seus circuitos, rodadas e configurações (%1)? Isso não dá para desfazer.
en.DadosTitulo=Where your circuits are kept
en.DadosSub=Circuits, runs and the AI contexts are kept in a visible folder.
en.DadosTexto=MaiSim keeps your work in this folder (it stays even if you uninstall):
en.DadosNoPrograma=Pick a folder outside the program folder (%1): the program folder is replaced on every update.
en.PortaTitulo=Port
en.PortaSub=MaiSim's address in your browser: http://localhost:<port>
en.PortaTexto=MaiSim uses this port and the next 6. If you already run another MaiSim (in WSL, for instance), pick another one.
en.PortaRotulo=Port (1024 to 65000):
en.PortaInvalida=The port must be a number from 1024 to 65000.
en.PortaBloqueada=Port %1 is refused by browsers (MaiSim uses it and the next 6). Use %2 instead?
en.PortaOcupada=Port %1 is already in use on this computer (another MaiSim, or WSL forwarding its port). Use %2 instead?
en.Abrir=Open MaiSim now (the first time takes up to a minute)
en.Desligar=Stop MaiSim
en.PastaCircuitos=My circuits folder
en.ApagarDados=Also delete your circuits, runs and settings (%1)? This cannot be undone.

[Files]
Source: "{#Fonte}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Imagens}\maisim.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; uma atualização troca o programa inteiro (os dados ficam fora: Documentos\MaiSim, %APPDATA%\MaiSim, %LOCALAPPDATA%\MaiSim\Cache)
Type: filesandordirs; Name: "{app}\python"
Type: filesandordirs; Name: "{app}\jre"
Type: filesandordirs; Name: "{app}\maisim"

[Icons]
Name: "{autodesktop}\{#Nome}"; Filename: "{#Pythonw}"; Parameters: """{#Lancador}"" --produto --abrir"; WorkingDir: "{app}"; IconFilename: "{app}\maisim.ico"
Name: "{group}\{#Nome}"; Filename: "{#Pythonw}"; Parameters: """{#Lancador}"" --produto --abrir"; WorkingDir: "{app}"; IconFilename: "{app}\maisim.ico"
Name: "{group}\{cm:Desligar}"; Filename: "{#Pythonw}"; Parameters: """{#Lancador}"" --produto --parar"; WorkingDir: "{app}"; IconFilename: "{app}\maisim.ico"
Name: "{group}\{cm:PastaCircuitos}"; Filename: "{code:PastaDados}"

[Run]
Filename: "{#Pythonw}"; Parameters: """{#Lancador}"" --produto --abrir"; WorkingDir: "{app}"; Description: "{cm:Abrir}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{#Pythonw}"; Parameters: """{#Lancador}"" --produto --parar --forcar"; WorkingDir: "{app}"; Flags: runhidden waituntilterminated; RunOnceId: "Desligar"

[UninstallDelete]
; só o que o instalador pôs (a pasta do programa some sozinha se ficar vazia): se alguém escolheu guardar os circuitos
; dentro dela, eles ficam
Type: filesandordirs; Name: "{app}\python"
Type: filesandordirs; Name: "{app}\jre"
Type: filesandordirs; Name: "{app}\maisim"

[Code]
var
  PaginaDados: TInputDirWizardPage;
  PaginaPorta: TInputQueryWizardPage;

function ArquivoConfig: String;
begin
  Result := ExpandConstant('{userappdata}\MaiSim\maisim.env');
end;

{ o valor de NOME=valor na config pessoal (a de uma instalação anterior), ou Padrao }
function LeConfig(Nome, Padrao: String): String;
var Linhas: TArrayOfString; I: Integer;
begin
  Result := Padrao;
  if LoadStringsFromFile(ArquivoConfig, Linhas) then
    for I := 0 to GetArrayLength(Linhas) - 1 do
      if Pos(Nome + '=', Linhas[I]) = 1 then
        Result := Copy(Linhas[I], Length(Nome) + 2, MaxInt);
end;

function PastaDados(Param: String): String;
begin
  if PaginaDados <> nil then Result := PaginaDados.Values[0]
  else Result := LeConfig('MAISIM_DADOS', ExpandConstant('{userdocs}\MaiSim'));
end;

{ alguma das sete portas (Porta…Porta+6) é recusada pelos navegadores (ERR_UNSAFE_PORT)? a mesma lista de
  PORTAS_BLOQUEADAS em config/ler_config.py }
function PortaBloqueada(Porta: Integer): Boolean;
var Lista: String; I: Integer;
begin
  Result := False;
  Lista := ',1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080,';
  for I := Porta to Porta + 6 do
    if Pos(',' + IntToStr(I) + ',', Lista) > 0 then Result := True;
end;

{ a porta está em uso? (netstat: algo escutando nela — outro MaiSim, ou o WSL repassando a porta de lá) }
function PortaOcupada(Porta: Integer): Boolean;
var Saida, Texto: String; Cod: Integer; Ansi: AnsiString;
begin
  Result := False;
  Saida := ExpandConstant('{tmp}\netstat.txt');
  if Exec(ExpandConstant('{cmd}'), '/C netstat -ano -p TCP > "' + Saida + '"', '', SW_HIDE, ewWaitUntilTerminated, Cod) then
    if LoadStringFromFile(Saida, Ansi) then begin
      Texto := String(Ansi);
      Result := (Pos(':' + IntToStr(Porta) + ' ', Texto) > 0) and (Pos('LISTENING', Texto) > 0);
    end;
end;

procedure InitializeWizard;
begin
  PaginaDados := CreateInputDirPage(wpSelectDir, CustomMessage('DadosTitulo'), CustomMessage('DadosSub'), CustomMessage('DadosTexto'), False, '');
  PaginaDados.Add('');
  PaginaDados.Values[0] := LeConfig('MAISIM_DADOS', ExpandConstant('{userdocs}\MaiSim'));
  PaginaPorta := CreateInputQueryPage(PaginaDados.ID, CustomMessage('PortaTitulo'), CustomMessage('PortaSub'), CustomMessage('PortaTexto'));
  PaginaPorta.Add(CustomMessage('PortaRotulo'), False);
  PaginaPorta.Values[0] := LeConfig('MAISIM_PORTA', '7100');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var P, Livre: Integer; Chave, D, A: String;
begin
  Result := True;
  if CurPageID = PaginaDados.ID then begin
    { os circuitos nunca dentro da pasta do programa (nem ela dentro deles): a atualização e o desinstalar mexem nela }
    D := Lowercase(AddBackslash(PaginaDados.Values[0]));
    A := Lowercase(AddBackslash(WizardDirValue));
    if (Pos(A, D) = 1) or (Pos(D, A) = 1) then begin
      MsgBox(FmtMessage(CustomMessage('DadosNoPrograma'), [WizardDirValue]), mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = PaginaPorta.ID then begin
    P := StrToIntDef(PaginaPorta.Values[0], 0);
    if (P < 1024) or (P > 65000) then begin
      MsgBox(CustomMessage('PortaInvalida'), mbError, MB_OK);
      Result := False;
    end else if PortaBloqueada(P) or ((IntToStr(P) <> LeConfig('MAISIM_PORTA', '')) and PortaOcupada(P)) then begin
      Livre := P + 100;
      while (Livre <= 64900) and (PortaBloqueada(Livre) or PortaOcupada(Livre)) do Livre := Livre + 100;
      if PortaBloqueada(P) then Chave := 'PortaBloqueada' else Chave := 'PortaOcupada';
      if MsgBox(FmtMessage(CustomMessage(Chave), [IntToStr(P), IntToStr(Livre)]), mbConfirmation, MB_YESNO) = IDYES then
        PaginaPorta.Values[0] := IntToStr(Livre);
      Result := False;   { mostra a porta nova na página antes de seguir }
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    ForceDirectories(ExpandConstant('{userappdata}\MaiSim'));
    ForceDirectories(PaginaDados.Values[0]);
    SaveStringToFile(ArquivoConfig, '# MaiSim: a porta e a pasta dos seus circuitos (o instalador grava; pode editar)' + #13#10 +
      'MAISIM_PORTA=' + PaginaPorta.Values[0] + #13#10 + 'MAISIM_DADOS=' + PaginaDados.Values[0] + #13#10, False);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var Dados: String;
begin
  if CurUninstallStep = usPostUninstall then begin
    Dados := LeConfig('MAISIM_DADOS', ExpandConstant('{userdocs}\MaiSim'));
    if MsgBox(FmtMessage(CustomMessage('ApagarDados'), [Dados]), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then begin
      DelTree(Dados, True, True, True);
      DelTree(ExpandConstant('{userappdata}\MaiSim'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\MaiSim\Cache'), True, True, True);   { só o cache: o resto de %LOCALAPPDATA%\MaiSim não é nosso }
    end;
  end;
end;
