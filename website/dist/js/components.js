
function Breadcrumb() {
}

function ManageThemesPage() {
}

function EditThemePage() {
}

function UploadSoundDialog(viewRoot) {
    var self = this;
    var audio = document.createElement("AUDIO");
    this.progress = 0;
    this.error = null;
    this.errorMessages = {
        FILE_TOO_BIG: "Sound file too big, max 100KB",
    }
    this.playSound = function(file) {
        audio.src = URL.createObjectURL(file);
        audio.play();
    }
    this.upload = function(form) {
        if (form.soundFile.files[0].size > 100000) {
			this.error = "FILE_TOO_BIG";
			return;
		}
		this.error = null;
		this.progress++;
		$.ajax({
            type: "POST",
            enctype: 'multipart/form-data',
            url: "https://support2.lsdsoftware.com/audify/upload-sound",
            data: new FormData(form),
            processData: false,
            contentType: false,
            cache: false,
            timeout: 600000,
            success: function(data) {
				self.progress--;
				var result = data[0];
				if (result.error) self.error = result.error;
				else $(viewRoot).triggerHandler("success", "https://support2.lsdsoftware.com/audify/download-sound?fileId=" + result.fileId);
            },
            error: function(e) {
				self.progress--;
				self.error = (e.responseText||'').substr(0, 200);
            }
        })
    }
}

function BrowseSoundDialog(viewRoot) {
    var self = this;
    var audio = document.createElement("AUDIO");
    this.items = null;
    this.progress = 0;
    this.loadItems = function() {
        this.progress++;
        $.ajax({
            url: "https://support2.lsdsoftware.com/audify/list-library-sounds?collectionId=adobe-multimedia",
            success: function(items) {
				self.progress--;
                self.items = items;
            },
            error: function(err) {
				self.progress--;
				console.log(err);
            }
        })
    }
    this.playItem = function(item) {
        audio.src = getSoundUrl(item);
        audio.play();
    }
    this.selectItem = function(item) {
        $(viewRoot).triggerHandler("success", getSoundUrl(item));
    }
    function getSoundUrl(item) {
        return "https://support2.lsdsoftware.com/audify/download-library-sound?collectionId=adobe-multimedia&fileId=" + item;
    }
}
