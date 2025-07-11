import os
import shutil
from django.apps import AppConfig
from django.conf import settings

class InterfaceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "interface"

    def ready(self):
        media_path = os.path.join(settings.MEDIA_ROOT)
        if os.path.exists(media_path):
            for filename in os.listdir(media_path):
                file_path = os.path.join(media_path, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    print(f'Fout bij verwijderen van {file_path}: {e}')