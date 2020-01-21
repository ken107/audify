
function Breadcrumb() {
}

function ManageThemesPage() {
}

function EditThemePage() {
}

function UploadSoundDialog() {
    var audio = document.createElement("AUDIO");
    this.playSound = function(file) {
        audio.src = URL.createObjectURL(file);
        audio.play();
    }
}
