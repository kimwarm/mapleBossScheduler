' 배율 새로고침 워커를 콘솔 창 없이 백그라운드로 실행 (로그: scripts\worker.log)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c npm run worker", 0, False
