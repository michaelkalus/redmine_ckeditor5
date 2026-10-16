# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorMentionsControllerTest < Redmine::ControllerTest
  tests RedmineCkeditorMentionsController
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses, :issues, :enumerations,
           :groups_users

  def setup
    User.current = nil
    @request.session[:user_id] = 3 # dlopper, Developer on project 1
    Role.find(2).remove_permission!(:add_issue_watchers)
  end

  def logins = JSON.parse(response.body).map { |user| user['login'] }

  def test_developer_without_watcher_permission_gets_suggestions
    get :users, params: {project_id: 1, q: 'j'}

    assert_response :success
    assert_includes logins, 'jsmith'
    assert_equal %w[login name], JSON.parse(response.body).first.keys.sort
  end

  def test_requires_view_issues
    Role.find(2).remove_permission!(:view_issues)
    get :users, params: {project_id: 1, q: 'j'}

    assert_response :forbidden
  end

  def test_excludes_locked_users
    User.find(2).lock!
    get :users, params: {project_id: 1, q: 'j'}

    refute_includes logins, 'jsmith'
  end

  def test_includes_members_through_groups
    Member.create!(principal: Group.find(10), project: Project.find(1), role_ids: [2])
    get :users, params: {project_id: 1, q: 'misc'}

    assert_includes logins, 'miscuser8'
  end

  def test_filters_users_who_cannot_see_the_issue
    Issue.any_instance.stubs(:visible?).returns(false)
    Issue.any_instance.stubs(:visible?).with(User.find(2)).returns(true)
    get :users, params: {issue_id: 1, q: ''}

    assert_equal ['jsmith'], logins
  end

  def test_unknown_issue_is_not_found
    get :users, params: {issue_id: 999_999, q: ''}

    assert_response :not_found
  end

  def test_disabled_setting_is_not_found
    with_settings(plugin_redmine_ckeditor: {'user_mentions' => '0'}) do
      get :users, params: {project_id: 1, q: 'j'}
    end

    assert_response :not_found
  end
end
