# frozen_string_literal: true

class RedmineCkeditorMentionsController < ApplicationController
  LIMIT = 10

  before_action :require_login
  before_action :ensure_enabled
  before_action :find_context

  def users
    users = candidate_users
    users = users.select { |user| @issue.visible?(user) } if @issue
    render json: users.first(LIMIT).map { |user| {login: user.login, name: user.name} }
  end

  private

  def ensure_enabled
    render_404 unless RedmineCkeditorSetting.user_mentions?
  end

  def find_context
    if params[:issue_id].present?
      @issue = Issue.visible.find_by(id: params[:issue_id])
      return render_404 unless @issue

      @project = @issue.project
    else
      @project = Project.visible.find_by_param(params[:project_id])
      return render_404 unless @project
    end
    deny_access unless User.current.allowed_to?(:view_issues, @project)
  end

  def candidate_users
    scope = User.visible.active.where(id: Member.where(project_id: @project.id).select(:user_id))
    query = params[:q].to_s.strip
    scope = scope.like(query) if query.present?
    scope.sorted.distinct.limit(LIMIT * 5).to_a
  end
end
