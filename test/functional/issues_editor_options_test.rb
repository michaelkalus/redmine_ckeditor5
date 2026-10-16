# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorIssuesEditorOptionsTest < Redmine::ControllerTest
  tests IssuesController
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses, :issues, :enumerations,
           :workflows, :custom_fields, :custom_values, :custom_fields_projects, :custom_fields_trackers

  def setup
    User.current = nil
    @request.session[:user_id] = 3
    Role.find(2).remove_permission!(:add_issue_watchers)
  end

  def test_issue_edit_form_passes_mention_sources
    with_settings(text_formatting: 'CKEditor') { get :show, params: {id: 1} }

    assert_response :success
    assert_includes response.body, 'redmine_ckeditor/mentions/users'
    assert_match(/mentions\/users\?[^"]*issue_id=1/, response.body)
    assert_includes response.body, 'issues/auto_complete'
  end

  def test_new_issue_form_has_project_context_without_issue_id
    with_settings(text_formatting: 'CKEditor') { get :new, params: {project_id: 1} }

    assert_match(/mentions\/users\?project_id=1(?!&|\\u0026)/, response.body)
  end

  def mentions_config
    response.body[/redmineMentions":(\{[^}]*\})/, 1].to_s
  end

  def test_issue_mentions_disabled_omits_issues_url
    with_settings(text_formatting: 'CKEditor', plugin_redmine_ckeditor: {'issue_mentions' => '0'}) do
      get :show, params: {id: 1}
    end

    assert_not_empty mentions_config
    assert_includes mentions_config, 'redmine_ckeditor/mentions/users'
    assert_not_includes mentions_config, 'issues/auto_complete'
  end

  def test_user_mentions_disabled_omits_users_url
    with_settings(text_formatting: 'CKEditor', plugin_redmine_ckeditor: {'user_mentions' => '0'}) do
      get :show, params: {id: 1}
    end

    assert_not_empty mentions_config
    assert_includes mentions_config, 'issues/auto_complete'
    assert_not_includes mentions_config, 'redmine_ckeditor/mentions/users'
  end
end
