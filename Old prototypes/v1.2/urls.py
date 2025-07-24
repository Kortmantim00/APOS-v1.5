from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('reset/', views.reset_viewer, name='reset_viewer'),
    path('check-volume-ready/', views.check_volume_ready, name='check_volume_ready'),
]

