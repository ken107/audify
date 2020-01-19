window.onload = async function() {
  const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
  const manageThemesBtn = document.getElementById("manage-themes-btn") as HTMLButtonElement;
  const errorText = document.getElementById("error-text") as HTMLDivElement;
  const successText = document.getElementById("success-text") as HTMLDivElement;

  //populate
  const settings = await getSettings();
  settings.myThemes?.forEach((theme, index) => {
    const option = document.createElement("OPTION") as HTMLOptionElement;
    option.value = theme.id;
    option.innerHTML = theme.name;
    themeSelect.appendChild(option);
  })

  if (settings.currentThemeId) themeSelect.value = settings.currentThemeId;

  //events
  themeSelect.addEventListener("change", onThemeChanged);
  manageThemesBtn.addEventListener("click", onManageThemes);


  async function onThemeChanged() {
    try {
      errorText.innerText =
      successText.innerText = "";
      await saveSettings({currentThemeId: themeSelect.value});
      successText.innerText = "Saved!";
    }
    catch (err) {
      errorText.innerText = err.message;
    }
  }

  async function onManageThemes() {
    try {
      errorText.innerText =
      successText.innerText = "";
      const script = chrome.runtime.getManifest().content_scripts?.find(s => s.matches?.every(m => m.endsWith("/my-themes.html")));
      if (!script) throw new Error("Manage-themes content-script declaration not found");
      await createTab(script.matches![config.isDev ? 0 : 1]);
    }
    catch (err) {
      errorText.innerText = err.message;
    }
  }
}
