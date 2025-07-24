// ====================
// TABS.JS
// Inhoud tabbladen opslaan als localstorrage
// ====================

// Functie om de actieve tab en inhoud te wisselen
function switchTab(event, tabId) {
  // Voorkom dat de pagina naar de bovenkant scrollt
  event.preventDefault();

  // Verwijder de 'active' klasse van alle tablinks en tab-content
  const tabLinks = document.querySelectorAll('.tablink');
  const tabContents = document.querySelectorAll('.tab-content');
  tabLinks.forEach(link => link.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  // Voeg de 'active' klasse toe aan de geklikte tab en de bijbehorende inhoud
  event.target.classList.add('active');
  document.getElementById(tabId).classList.add('active');

  // Sla de actieve tab op in localStorage
  localStorage.setItem('activeTab', tabId);
}

// Voeg event listeners toe voor de tabbladen
document.getElementById('tab-upload').addEventListener('click', function(event) {
  switchTab(event, 'tab-upload-content');
});
document.getElementById('tab-viewer').addEventListener('click', function(event) {
  switchTab(event, 'tab-viewer-content');
});
document.getElementById('tab-settings').addEventListener('click', function(event) {
  switchTab(event, 'tab-settings-content');
});

// Bij het laden van de pagina, controleer welk tabblad actief was en zet deze als actief
document.addEventListener('DOMContentLoaded', () => {
  const activeTab = localStorage.getItem('activeTab') || 'tab-upload-content'; // Standaard 'tab-upload-content' als er geen actieve tab is opgeslagen
  document.getElementById(activeTab).click();
});
