window.onload = async function() {
  const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
  const manageThemesBtn = document.getElementById("manage-themes-btn") as HTMLButtonElement;
  const errorText = document.getElementById("error-text") as HTMLDivElement;
  const successText = document.getElementById("success-text") as HTMLDivElement;

  //populate
  const settings = await getSettings();
  const myThemes = settings.myThemes || [];
  myThemes.forEach((theme, index) => {
    const option = document.createElement("OPTION") as HTMLOptionElement;
    option.value = String(index);
    option.innerHTML = theme.name;
    themeSelect.appendChild(option);
  })

  //events
  themeSelect.addEventListener("change", onThemeChanged);
  manageThemesBtn.addEventListener("click", onManageThemes);


  async function onThemeChanged() {
    try {
      errorText.innerText =
      successText.innerText = "";
      const selectedIndex = Number(themeSelect.value);
      await saveSettings({currentTheme: myThemes[selectedIndex]});
      successText.innerText = "Saved!";
    }
    catch (err) {
      errorText.innerText = err.message;
    }
  }

  async function onManageThemes() {
    try {
      await createTab("http://localhost:8080/");
    }
    catch (err) {
      alert(err.message);
    }
  }
}
