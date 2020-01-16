window.onload = async function() {
  const themeEdit = document.getElementById("theme-edit") as HTMLTextAreaElement;
  const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
  const errorText = document.getElementById("error-text") as HTMLDivElement;
  const successText = document.getElementById("success-text") as HTMLDivElement;

  const settings = await getSettings();
  themeEdit.value = JSON.stringify(settings.currentTheme || config.defaultTheme, null, 2);
  saveBtn.addEventListener("click", onSave);


  async function onSave(e: Event) {
    try {
      errorText.innerText = successText.innerText = "";
      settings.currentTheme = JSON.parse(themeEdit.value);
      await saveSettings(settings);
      successText.innerText = "Saved!";
    }
    catch (err) {
      errorText.innerText = err.message;
    }
  }
}
