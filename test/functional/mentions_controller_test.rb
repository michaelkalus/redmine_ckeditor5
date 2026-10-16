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
    get :users, params: {project_id: 1, q: 'j'}
    assert_includes logins, 'jsmith'

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

  def test_email_address_is_not_searchable
    get :users, params: {project_id: 1, q: 'jsmith@somenet.foo'}

    assert_response :success
    assert_equal [], logins

    get :users, params: {project_id: 1, q: 'jsmith'}
    assert_includes logins, 'jsmith'
  end

  def test_searches_first_and_last_name_tokens
    get :users, params: {project_id: 1, q: 'john smi'}

    assert_includes logins, 'jsmith'
  end

  def test_project_mode_excludes_members_without_view_issues
    user = User.find(4)
    Member.where(user_id: 4, project_id: 1).destroy_all
    Member.create!(principal: user, project: Project.find(1), role_ids: [3])
    get :users, params: {project_id: 1, q: user.login}
    assert_includes logins, user.login

    Role.find(3).remove_permission!(:view_issues)
    get :users, params: {project_id: 1, q: user.login}
    refute_includes logins, user.login
  end

  def test_anonymous_gets_no_suggestions
    @request.session[:user_id] = nil
    get :users, params: {project_id: 1, q: 'j'}

    assert_not response.successful?
  end

  def test_issue_invisible_to_requester_is_not_found
    Project.find(2).update_column(:is_public, false)
    Member.where(user_id: 3, project_id: 2).destroy_all
    get :users, params: {issue_id: 4, q: ''}

    assert_response :not_found
  end
end
