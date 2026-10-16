# frozen_string_literal: true

module RedmineCkeditor
  module Helper
    def ckeditor_javascripts
      javascript_include_tag('ckeditor5', plugin: 'redmine_ckeditor') +
        javascript_include_tag('integration', plugin: 'redmine_ckeditor')
    end

    def ckeditor_mention_sources
      project = (@issue.project if @issue.is_a?(Issue)) || @project
      return {} unless project.is_a?(Project) && project.persisted?

      sources = {}
      if RedmineCkeditorSetting.user_mentions?
        issue_id = @issue.id if @issue.is_a?(Issue) && @issue.persisted?
        sources[:usersUrl] = redmine_ckeditor_mention_users_path(project_id: project.id, issue_id: issue_id)
      end
      if RedmineCkeditorSetting.issue_mentions?
        sources[:issuesUrl] = auto_complete_issues_path(project_id: project.id, scope: 'all')
      end
      sources
    end
  end
end
