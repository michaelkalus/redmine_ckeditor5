RedmineApp::Application.routes.draw do
  post 'redmine_ckeditor/uploads', to: 'redmine_ckeditor_uploads#create', as: :redmine_ckeditor_uploads
  get 'redmine_ckeditor/mentions/users', to: 'redmine_ckeditor_mentions#users', as: :redmine_ckeditor_mention_users
end
