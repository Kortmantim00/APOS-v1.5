from django.urls import path
from . import views

urlpatterns = [
    path('', views.login_view, name='login'),
    path('upload/', views.upload, name='upload'),
    path('viewer/', views.viewer, name='viewer'),
    path('reset/', views.reset_viewer, name='reset_viewer'),
    path('media-files/', views.list_media_files, name='media_files'),
]
